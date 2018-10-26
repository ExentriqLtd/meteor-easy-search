import './did-you-mean.css';
/**
 * The DidYouMeanComponent lets you display content when there are no results.
 *
 * @type {DidYouMeanComponent}
 */
EasySearch.DidYouMeanComponent = class DidYouMeanComponent extends BaseComponent {
  /**
   * Return true if there are no results.
   *
   * @returns {boolean}
   */
  noResults() {
    return !!this.eachIndex(function (index, name) {
      return index.getComponentMethods(name).hasNoResults();
    }, 'every');
  }

  search(string) {
    if (!string) {
      this.results.set([]);
      return;
    }
    Meteor.call('Search.didYouMean', { query: string }, (err, res) => {
      if (res) { 
        console.log(res);
        this.results.set(res);
      } else {
        console.log(err);
      }
    });
  }

  suggestions() {
    return this.results.get();
  }

  changeSearch(search) {
    const dict = this.indexes[0].getComponentDict();
    dict.set('searchDefinition', search);
  }

  onCreated() {
    super.onCreated(...arguments);
    this.results = new ReactiveVar([]);
    this.debouncedSearch = _.debounce((searchString) => {
      searchString = searchString.trim();
      if (this.searchString !== searchString) {
        this.searchString = searchString;
        if (searchString.length >= 0) {
          this.search(searchString);
        } else {
          this.search('');
        }
      }
    }, 200);
    this.autorun(() => {
      const dict = this.indexes[0].getComponentDict();
      const searchString = dict.get('searchDefinition');
      if (this.noResults()) {
        this.debouncedSearch(searchString);
      } else if (this.results.curValue.length) {
        this.results.set([]);
      }
    });
  }

  events() {
    return [{
      'click .js-change-search': function(event) {
        event.preventDefault();
        const search = Blaze.getData(event.target);
        this.changeSearch(search);
        const data = this.data();
        if (data.onChange) {
          data.onChange(search);
        }
      },
    }];
  }
};

EasySearch.DidYouMeanComponent.register('EasySearch.DidYouMean');
