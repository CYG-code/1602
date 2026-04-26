Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    categoryOptions: {
      type: Array,
      value: [],
    },
    selectedCategories: {
      type: Array,
      value: [],
    },
    priceOptions: {
      type: Array,
      value: [],
    },
    selectedPrice: {
      type: String,
      value: "all",
    },
    sortOptions: {
      type: Array,
      value: [],
    },
    selectedSort: {
      type: String,
      value: "distance_asc",
    },
  },

  data: {
    localCategories: [],
    localPrice: "all",
    localSort: "distance_asc",
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.syncLocalState();
      }
    },
  },

  methods: {
    syncLocalState() {
      this.setData({
        localCategories: Array.isArray(this.properties.selectedCategories)
          ? [...this.properties.selectedCategories]
          : [],
        localPrice: this.properties.selectedPrice || "all",
        localSort: this.properties.selectedSort || "distance_asc",
      });
    },

    handleClose() {
      this.triggerEvent("close");
    },

    handleMaskTap() {
      this.triggerEvent("close");
    },

    handlePanelTap() {},

    handleToggleCategory(event) {
      const value = event.currentTarget.dataset.value;
      if (!value) {
        return;
      }
      const current = new Set(this.data.localCategories);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      this.setData({
        localCategories: Array.from(current),
      });
    },

    handleSelectPrice(event) {
      const value = event.currentTarget.dataset.value || "all";
      this.setData({
        localPrice: value,
      });
    },

    handleSelectSort(event) {
      const value = event.currentTarget.dataset.value || "distance_asc";
      this.setData({
        localSort: value,
      });
    },

    handleReset() {
      this.setData({
        localCategories: [],
        localPrice: "all",
        localSort: "distance_asc",
      });
    },

    handleApply() {
      this.triggerEvent("apply", {
        categories: this.data.localCategories,
        price: this.data.localPrice,
        sort: this.data.localSort,
      });
    },
  },
});
