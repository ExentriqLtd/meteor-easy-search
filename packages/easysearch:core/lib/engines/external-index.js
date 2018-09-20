import Cursor from "../core/cursor";
import ReactiveEngine from "../core/reactive-engine";
import ExGuardianApi from "meteor/exentriq:guardian-connector";
import { ReactiveVar } from "meteor/reactive-var";
let Future;
if (Meteor.isServer) {
  Future = require("fibers/future");
}

class Cache {
  constructor() {
    this.data = {};
    this.lock = {};
    this.access = {};
    const interval = 15000;
    this.intervalHandle = Meteor.setInterval(() => {
      const not = new Date().getTime();
      const keys = Object.keys(this.lock);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (this.lock[key] <= 0) {
          if (now - this.access[key] >= interval) {
            delete this.data[key];
            delete this.lock[key];
            delete this.access[key];
          }
        }
      }
    }, interval);
  }

  register(id) {
    this.lock[id] = (this.lock[id] || 0) + 1;
    this.access[id] = new Date().getTime();
  }

  unregister(id) {
    this.lock[id] = this.lock[id] - 1;
    this.access[id] = new Date().getTime();
  }

  add(id, data) {
    this.data[id] = data;
  }

  get(id) {
    return this.data[id];
  }
}

const prepareData = ({ data, total }, col, raw, map) => {
  if (raw) {
    return { 
      data: _.map(data, (e) => e.map || e),
      total,
    };
  }
  if (map) {
    return {
      data: map(data),
      total,
    }
  }
  const objIds = [];
  if (data.length > 0) {
    data.forEach(function(item) {
      objIds.push(item.map._id);
    });
  }
  const selector = { _id: { $in: objIds } };
  const res = col.find(selector).fetch();
  const mongoData = _.sortBy(res, el => objIds.indexOf(el._id));
  return { total, data: mongoData };
};

const cache = new Cache();

const remove = (array, item) => {
  const index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
};

class ElasticCursor {
  constructor(id, selector, searchString, searchOptions, col, raw, map) {
    this.id = id;
    this.col = col;
    this.raw = raw;
    this.map = map;
    this.countDep = new Tracker.Dependency();
    this.ready = new ReactiveVar(false);
    this.dataDep = new Tracker.Dependency();
    this.data = cache.get(id);
    if (!this.data) {
      this.data = { total: 0, entries: [] };
      cache.add(id, this.data);
    }
    cache.register(id);
    this.search(selector, searchString, searchOptions);
    this.cbs = {
      addedAt: [],
      removed: [],
      movedTo: [],
      changedAt: []
    };
    this.mongoCursor = {
      count: () => {
        const data = this.data.entries;
        this.countDep.depend();
        return this.data.total;
      },
      observe: ({ addedAt, removed, movedTo, changedAt }) => {
        const data = this.data.entries;
        this.cbs.addedAt.push(addedAt);
        this.cbs.removed.push(removed);
        this.cbs.movedTo.push(movedTo);
        this.cbs.changedAt.push(changedAt);
        for (let i = 0; i < data.length; i += 1) {
          addedAt(data[i], i, i === data.length - 1 ? null : data[i + 1]._id);
        }
        return {
          stop: () => {
            remove(this.cbs.addedAt, addedAt);
            remove(this.cbs.movedTo, movedTo);
            remove(this.cbs.removed, removed);
            remove(this.cbs.changedAt, changedAt);
          }
        };
      },
      ready: () => console.log('ready', this.ready.get()) || this.ready.get()
    }
  }

  search(selector, searchString, findOptions) {
    const args = [
      searchString,
      findOptions.fields,
      JSON.stringify(selector),
      findOptions.skip || 0,
      findOptions.limit || 10
    ];
    if (this.data.prom){
      this.data.prom.cancel();
    }
    this.ready.set(false)
    const prom = ExGuardianApi.call(
      "elasticSearch.mongoCustomSearchPaginated",
      args,
      true
    );
    this.data.prom = prom;

    prom.then(Meteor.bindEnvironment(result => {
      const { total, list: { list } } = result && result.result;
      this.publishData({ total, data: list });
    }));

    prom.catch(Meteor.bindEnvironment(error => {
      console.error(error);
      this.publishData({ total: 0, data: [] });
    }));

    prom.finally(Meteor.bindEnvironment(() => {
    }));
  }

  publishData(d) {
    const { total, data } = prepareData(d, this.col, this.raw, this.map);
    const currentIds = _.pluck(data, "_id");
    const earlierIds = _.pluck(this.data.entries, "_id");
    const removed = _.difference(earlierIds, currentIds);
    const added = _.difference(currentIds, earlierIds);
    const both = _.intersection(currentIds, earlierIds);

    const dataByIdNew = {};
    for (let i = 0; i < data.length; i += 1) {
      dataByIdNew[data[i]._id] = { i, d: data[i] };
    }

    const dataByIdOld = {};
    for (let i = 0; i < this.data.entries.length; i += 1) {
      dataByIdOld[this.data.entries[i]._id] = { i, d: this.data.entries[i] };
    }

    const actions = {};

    for (let i = 0; i < removed.length; i += 1) {
      actions[removed[i]] = "removed";
    }

    for (let i = 0; i < added.length; i += 1) {
      actions[added[i]] = { t: "added", at: currentIds.indexOf(added[i]) };
    }

    for (let i = 0; i < both.length; i += 1) {
      const id = both[i];
      const dOld = dataByIdOld[id];
      const dNew = dataByIdNew[id];
      if (_.isEqual(dOld.d, dNew.d)) {
        if (dOld.i === dNew.i) {
          actions[id] = 'equal';
        } else {
          actions[id] = { t: "moved", from: dOld.i, to: dNew.i };
        }
      } else {
        if (dOld.i === dNew.i) {
          actions[id] = { t: 'changed', at: dNew.i };
        } else {
          actions[id] = { t: "moved",from: dOld.i, to: dNew.i };
        }
      }
    }

    const ids = Object.keys(actions);
    this.data.entries.splice(0, this.data.entries.length, ...data);
    this.data.total = total;
    this.countDep.changed(); 
    this.dataDep.changed(); 
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const action = actions[id];
      if (action === 'removed') {
        this.run('removed', dataByIdOld[id].d);
      } else if (action.t === 'changed') {
        this.run('changed', dataByIdNew[id].d, dataByIdOld[id].d, action.at);
      } else if (action.t === 'moved') {
        this.run('movedTo', dataByIdNew[id].d, action.from, action.to, action.to === data.length - 1 ? null : data[action.to + 1]._id );
      } else if (action.t === 'added') {
        this.run('addedAt', dataByIdNew[id].d, action.at, action.at === data.length - 1 ? null : data[action.at + 1]._id );
      }
    }
    this.run('addedAt', 'ready');
    this.ready.set(true);
  }

  run(type, ...params) {
    if (!this.cbs[type]) {
      return //stopped
    }
    for (let i = 0; i < this.cbs[type].length; i += 1) {
      this.cbs[type][i](...params);
    }
  }

  fetch() {
    this.dataDep.depend();
    return this.data.entries;
  }

  count() {
    this.countDep.depend();
    return this.total;
  }

  stop() {
    this.cbs = null;
    this.data = null;
    cache.unregister(this.id);
  }
}

/**
 * The MongoDBEngine lets you search the index on the server side with MongoDB. Subscriptions and publications
 * are handled within the Engine.
 *
 * @type {MongoDBEngine}
 */
class ExternalEngine extends ReactiveEngine {
  onIndexCreate(indexConfig) {
    indexConfig.unblocked = true;
    indexConfig.providesReady = true;
    super.onIndexCreate(indexConfig);
    if (Meteor.isServer) {
      this.col = new Mongo.Collection(null);
    }
  }

  /**
   * Return default configuration.
   *
   * @returns {Object}
   */
  defaultConfiguration() {
    return _.defaults(
      {},
      ExternalEngine.defaultExternalConfiguration(this),
      super.defaultConfiguration()
    );
  }

  /**
   * Default mongo configuration, used in constructor and MinimongoEngine to get the configuration.
   *
   * @param {Object} engineScope Scope of the engine
   *constructor(config) {
   * @returns {Object}
   */
  static defaultExternalConfiguration(engineScope) {
    return {
      selector(searchObject, options) {
        const selector = {};
        let keyword = null;
        _.each(searchObject, (searchString, field) => {
          keyword = searchString;
        });
        return { selector: selector, searchString: keyword };
      },
      sort(searchObject, options) {
        return options.index.fields;
      }
    };
  }

  /**
   * Return the find options for the mongo find query.
   *
   * @param {String} searchDefinition Search definition
   * @param {Object} options          Search and index options
   */
  getFindOptions(searchDefinition, options) {
    return {};
  }

  getExternalFindOptions(searchDefinition, options) {
    return {
      sort: this.callConfigMethod("sort", searchDefinition, options),
      limit: options.search.limit,
      skip: options.search.skip,
      fields: options.index.fields
    };
  }

  /**
   * Return the reactive search cursor.
   *
   * @param {String} searchDefinition Search definition
   * @param {Object} options          Search and index options
   */
  getSearchCursor(searchDefinition, options) {
    const selObj = this.callConfigMethod("selector", searchDefinition, options),
      findOptions = this.getFindOptions(searchDefinition, options);
    const selector = selObj.selector;
    const searchString = selObj.searchString;
    check(searchString, String);
    check(options, Object);
    check(findOptions, Object);
    const time1 = new Date().getTime();
    const searchOptions = this.getExternalFindOptions(
      searchDefinition,
      options
    );
    const allParams = {
      ...selObj,
      ...searchOptions,
      connectionId: options.connectionId,
      limit: undefined,
      searchString: undefined,
      skip: undefined
    };

    const id = murmurhash3_32_gc(JSON.stringify(allParams));
    return new ElasticCursor(
      `${options.connectionId}${id}`,
      selector,
      searchString,
      searchOptions,
      options.index.collection,
      options.index.raw,
      options.index.map
    );
  }
}

export default ExternalEngine;
