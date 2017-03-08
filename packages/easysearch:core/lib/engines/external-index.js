import Cursor from '../core/cursor';
import ReactiveEngine from '../core/reactive-engine';

/**
 * The MongoDBEngine lets you search the index on the server side with MongoDB. Subscriptions and publications
 * are handled within the Engine.
 *
 * @type {MongoDBEngine}
 */
class ExternalEngine extends ReactiveEngine {

  onIndexCreate(indexConfig) {
    super.onIndexCreate(indexConfig);
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
      aggregation: '$or',
      selector(searchObject, options, aggregation) {
        const selector = {};

        selector[aggregation] = [];
        let keyword = null;
        _.each(searchObject, (searchString, field) => {
          keyword = searchString;
          const fieldSelector = engineScope.callConfigMethod(
            'selectorPerField', field, searchString, options
          );

          if (fieldSelector) {
            selector[aggregation].push(fieldSelector);
          }
        });

        return {selector: selector, searchString: keyword};
      },
      externalFetch(searchString, options, collection) {

      },
      selectorPerField(field, searchString) {
        const selector = {};

        searchString = searchString.replace(/(\W{1})/g, '\\$1');
        selector[field] = { '$regex' : `.*${searchString}.*`, '$options' : 'i'};

        return selector;
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
      fields: this.callConfigMethod('fields', searchDefinition, options)
    };
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
        options,
      this.config.aggregation),
      findOptions = this.getFindOptions(searchDefinition, options);
    const selector = selObj.selector;
    const searchString = selObj.searchString;
    check(searchString, String);
    check(options, Object);
    check(selector, Object);
    check(findOptions, Object);
    this.callConfigMethod('externalFetch', searchString, options, this.col);
    return new Cursor(
      this.col.find(selector, findOptions),
      this.col.find(selector).count()
    );
  }

}

export default ExternalEngine;
