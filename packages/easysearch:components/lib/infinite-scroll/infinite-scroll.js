/**
 * The LoadMoreComponent lets you load more documents through a button.
 *
 * @type {LoadMoreComponent}
 */
EasySearch.InfiniteScrollComponent = class InfiniteScrollComponent extends SingleIndexComponent {

  onRendered() {
    super.onRendered();
    console.log('onRendered');
    this.f = this.onScroll.bind(this);
    document.addEventListener('scroll', this.f, true);
  }

  onDestroyed() {
    super.onDestroyed();
    document.removeEventListener('scroll', this.f, true);
  }

  isElementVisible(el){
    var top = el.getBoundingClientRect().top, rect;
    el = el.parentNode;
    do {
      rect = el.getBoundingClientRect();
      if (top <= rect.bottom === false)
        return false;
      el = el.parentNode;
    } while (el != document.body);
    return top <= document.documentElement.clientHeight;
  };

  onScroll(evt) {
    let pos = this.$('.loading').position();
    if (this.moreDocuments() && pos.top + this.options.offset <= $(evt.currentTarget).height()){
      this.loadMore();
    }
  }

  /**
   * Load more documents.
   */
  loadMore() {
    this.index
      .getComponentMethods(this.name)
      .loadMore(this.options.count)
    ;
  }

  /**
   * Content of the component.
   *
   * @returns string
   */
  content() {
    return this.options.content;
  }

  /**
   * Attributes of the component.
   *
   * @returns string
   */
  attributes() {
    return this.getData().attributes || {};
  }

  /**
   * Return true if there are more documents to load.
   *
   * @returns {Boolean}
   */
  moreDocuments() {
    return this.index.getComponentMethods(this.name).hasMoreDocuments();
  }

  /**
   * Event map.
   *
   * @returns {Object}
   */
  events() {
    return [{
      'click .loading' : function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
        this.loadMore();
      }
    }];
  }

  /**
   * Return the default options.
   *
   * @returns {Object}
   */
  get defaultOptions() {
    return {
      content: 'Load more',
      offset: 100,
      count: 10
    };
  }
};

EasySearch.InfiniteScrollComponent.register('EasySearch.InfiniteScroll');
