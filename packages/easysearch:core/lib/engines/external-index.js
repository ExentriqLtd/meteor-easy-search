import Cursor from '../core/cursor';
import ReactiveEngine from '../core/reactive-engine';
import ExGuardianApi from 'meteor/exentriq:guardian-connector';
let Future;
if (Meteor.isServer) {
  Future = require('fibers/future');
}

let searchProm = null;

/**
 * The MongoDBEngine lets you search the index on the server side with MongoDB. Subscriptions and publications
 * are handled within the Engine.
 *
 * @type {MongoDBEngine}
 */
class ExternalEngine extends ReactiveEngine {

  onIndexCreate(indexConfig) {
    super.onIndexCreate({...indexConfig, unblocked: true});
    if (Meteor.isServer) {
      this.col = new Mongo.Collection(null)
    }
  }

  /**
   * Return default configuration.
   *
   * @returns {Object}
   */
  defaultConfiguration() {
    return _.defaults({}, ExternalEngine.defaultExternalConfiguration(this), super.defaultConfiguration());
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
        return {selector: selector, searchString: keyword};
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
    return {
      sort: this.callConfigMethod('sort', searchDefinition, options),
      limit: options.search.limit,
      skip: options.search.skip,
      fields: options.index.fields
    };
  }

  /**
   * Return array with fetched data
   *
   * @param {Object} selector Filter for api
   * @param {String} searchString Search definition
   * @param {Object} findOptions          Search and index options
   */
  externalFetch(selector, searchString, findOptions) {
  /*
      filter: {javaClass: 'java.util.HashMap', map: {
          'details.userId': this.userId,
      }}
  */

    //console.log('TIMEOUT SETTED');
    //console.log('findOptions', findOptions);
    const f = new Future();
    const args = [searchString, findOptions.fields, JSON.stringify(selector), findOptions.skip, findOptions.limit];
    //console.log('args', args);
    if(searchProm){
      searchProm.cancel();
      console.log('inside CANCEL');
    }

    const prom = ExGuardianApi.call('elasticSearch.mongoCustomSearch', args);
    
    //const result = Promise.await(prom);
    prom.then(function(result) {
      console.log('prom EXECUTED');
      f.return(result);
    });

    prom.catch(function(error) {
      console.log('inside CATCH');
      f.throw(error);
    });

    prom.finally(function() {
       if(prom.isCancelled()) {
            console.log('prom CANCELLED');
           f.return([]);
       }
    });

    searchProm = prom;
    
    return f.wait();
    
  }


  /**
   * Return ready collection.
   *
   * @param {Array} data Array with fetched data
   */
  prepareData(data) {
    //console.log('data', data);
    const objIds = [];
    if(data.length > 0){
      data.forEach(function(item) {
        objIds.push(item.map._id);
      });
    }
    const selector = {"_id": { "$in": objIds }};
    return selector;
  }

  /**
   * Return the reactive search cursor.
   *
   * @param {String} searchDefinition Search definition
   * @param {Object} options          Search and index options
   */
  getSearchCursor(searchDefinition, options) {
    const selObj = this.callConfigMethod(
        'selector',
        searchDefinition,
        options),
      findOptions = this.getFindOptions(searchDefinition, options);
    const selector = selObj.selector;
    const searchString = selObj.searchString;
    check(searchString, String);
    check(options, Object);
    //check(selector, Object);
    check(findOptions, Object);
    const time1 = new Date().getTime();
    const fetchedData = this.externalFetch(selector, searchString, findOptions);
    const time2 = new Date().getTime();
    const preparedSelector = this.prepareData(fetchedData);
    const time3 = new Date().getTime();
    console.log('Search Took:', time3-time1, time3 - time2);
    const collection = options.index.collection;
    console.log('preparedSelector', preparedSelector);
    return new Cursor(
      collection.find(preparedSelector),
      collection.find(preparedSelector).count()
    ); 

    //const fetchedData = this.externalFetch(selector, searchString, findOptions);
    //console.log('fetchedData', fetchedData);
    //const preparedSelector = this.prepareData(fetchedData);
    //const collection = options.index.collection;
    //console.log('preparedSelector', preparedSelector);
    //return new Cursor(
    //  collection.find(preparedSelector),
    //  collection.find(preparedSelector).count()
    //); 
  }

}

export default ExternalEngine;
