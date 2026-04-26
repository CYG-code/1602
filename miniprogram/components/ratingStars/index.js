Component({
  properties: {
    value: {
      type: Number,
      value: 0,
    },
    readonly: {
      type: Boolean,
      value: false,
    },
    size: {
      type: String,
      value: "medium",
    },
  },

  data: {
    stars: [1, 2, 3, 4, 5],
  },

  methods: {
    handleTap(event) {
      if (this.properties.readonly) {
        return;
      }
      const value = Number(event.currentTarget.dataset.value);
      this.triggerEvent("change", { value });
    },
  },
});
