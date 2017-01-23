/**
 * The LoadMoreComponent lets you load more documents through a button.
 *
 * @type {LoadMoreComponent}
 */
EasySearch.InfiniteScrollComponent = class InfiniteScrollComponent extends SingleIndexComponent {

  onRendered() {
    super.onRendered();
    this.f = this.onScroll.bind(this);
    document.addEventListener('scroll', this.f, true);
    if (this.options.scrollContainer) {
      this.computation = Tracker.autorun(() => {
        this.index.getComponentMethods(this.name).hasMoreDocuments();
        Tracker.afterFlush(() => {
          this.onScroll();
        });
      })
    }
  }

  onDestroyed() {
    super.onDestroyed();
    document.removeEventListener('scroll', this.f, true);
    if (this.computation) {
      this.computation.stop();
      this.computation = null;
    }
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
    var target = (evt && evt.currentTarget) || this.options.scrollContainer ;
    let pos = $(target).find('.loading-easy-search').position();
    if (this.moreDocuments() && pos.top - this.options.offset <= $(target).height()){
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
      'click .loading-easy-search' : function (evt) {
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
      scrollContainer: null,
      offset: 100,
      count: 5
    };
  }
};

EasySearch.InfiniteScrollComponent.register('EasySearch.InfiniteScroll');
