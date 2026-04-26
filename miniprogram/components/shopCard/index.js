Component({
  properties: {
    shop: {
      type: Object,
      value: null,
      observer(shop) {
        if (!shop) {
          this.setData({
            distanceText: "",
            ratingText: "暂无评分",
            checkinText: "0 次打卡",
          });
          return;
        }

        const distance = Number(shop.distance || 0);
        const avgRating = Number(shop.avgRating || 0);
        const checkinCount = Number(shop.checkinCount || 0);

        this.setData({
          distanceText: distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`,
          ratingText: avgRating > 0 ? avgRating.toFixed(1) : "暂无评分",
          checkinText: `${checkinCount} 次打卡`,
        });
      },
    },
  },

  data: {
    distanceText: "",
    ratingText: "暂无评分",
    checkinText: "0 次打卡",
  },

  methods: {
    handleCardTap() {
      this.triggerEvent("detailtap", { shop: this.properties.shop });
    },
  },
});
