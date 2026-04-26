const db = wx.cloud.database();
const _ = db.command;

const DEFAULT_LOCATION = {
  latitude: 31.2304,
  longitude: 121.4737,
};

const RADIUS_OPTIONS = [5, 10, 20, 30, 50];
const RESULT_COUNT_OPTIONS = [5, 10, 20, 30, 50];
const CATEGORY_OPTIONS = [
  { label: "中餐", value: "中餐" },
  { label: "火锅", value: "火锅" },
  { label: "烧烤", value: "烧烤" },
  { label: "小吃", value: "小吃" },
  { label: "甜品", value: "甜品" },
  { label: "饮品", value: "饮品" },
  { label: "西餐", value: "西餐" },
  { label: "快餐", value: "快餐" },
];
const PRICE_OPTIONS = [
  { label: "不限价格", value: "all" },
  { label: "30元以下", value: "0_30" },
  { label: "30-60元", value: "30_60" },
  { label: "60-100元", value: "60_100" },
  { label: "100元以上", value: "100_plus" },
];
const SORT_OPTIONS = [
  { label: "距离优先", value: "distance_asc" },
  { label: "评分优先", value: "rating_desc" },
];

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

Page({
  data: {
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    scale: 16,
    markers: [],
    shops: [],
    selectedShop: null,
    selectedShopIndex: -1,
    loading: false,
    locationDenied: false,
    errorMessage: "",
    keyword: "",
    searched: false,
    searching: false,
    radiusOptions: RADIUS_OPTIONS,
    radiusIndex: 1,
    resultCountOptions: RESULT_COUNT_OPTIONS,
    resultCountIndex: 0,
    filterVisible: false,
    categoryOptions: CATEGORY_OPTIONS,
    selectedCategories: [],
    priceOptions: PRICE_OPTIONS,
    selectedPrice: "all",
    sortOptions: SORT_OPTIONS,
    selectedSort: "distance_asc",
    filterSummary: "不限分类 / 不限价格 / 距离优先",
  },

  onLoad() {
    this.mapContext = wx.createMapContext("shopMap", this);
    this.markerShopMap = new Map();
    this.mapMoveTimer = null;
    this.initLocationOnly();
  },

  onPullDownRefresh() {
    if (this.data.keyword.trim()) {
      this.handleSearch()
        .catch(() => {})
        .finally(() => wx.stopPullDownRefresh());
      return;
    }

    this.loadCheckinShopMarkers()
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  async initLocationOnly() {
    this.setData({
      loading: true,
      errorMessage: "",
      locationDenied: false,
      shops: [],
      markers: [],
      selectedShop: null,
      selectedShopIndex: -1,
      searched: false,
    });

    try {
      const location = await this.getUserLocation();
      this.setData({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (error) {
      const denied = (error && error.errMsg ? error.errMsg : "").includes("auth deny");
      this.setData({
        latitude: DEFAULT_LOCATION.latitude,
        longitude: DEFAULT_LOCATION.longitude,
        locationDenied: denied,
        errorMessage: denied ? "定位权限未开启，请先授权后再使用。" : "定位失败，已切换到默认城市。",
      });
    } finally {
      this.setData({ loading: false });
    }

    this.loadCheckinShopMarkers().catch(() => {});
  },

  getUserLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: "gcj02",
        success: resolve,
        fail: reject,
      });
    });
  },

  buildMarkers(shops) {
    return shops.map((shop, index) => ({
      id: index + 1,
      latitude: shop.location.latitude,
      longitude: shop.location.longitude,
      iconPath: "/images/icons/home-active.png",
      width: 28,
      height: 28,
      callout: {
        content: shop.name,
        color: "#1F2937",
        fontSize: 12,
        borderRadius: 12,
        padding: 8,
        bgColor: "#FFFFFF",
        display: "BYCLICK",
      },
    }));
  },

  applyMarkers(shops = []) {
    const markers = this.buildMarkers(shops);
    this.markerShopMap = new Map();
    markers.forEach((marker, index) => {
      this.markerShopMap.set(marker.id, shops[index]);
    });
    this.setData({ markers });
  },

  focusShopOnMap(shop) {
    const latitude = Number(shop && shop.location && shop.location.latitude);
    const longitude = Number(shop && shop.location && shop.location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    this.setData({
      latitude,
      longitude,
      scale: 17,
    });
  },

  async getCurrentCenterLocation() {
    return new Promise((resolve) => {
      if (!this.mapContext) {
        resolve({
          latitude: this.data.latitude,
          longitude: this.data.longitude,
        });
        return;
      }

      this.mapContext.getCenterLocation({
        success: (res) => resolve(res),
        fail: () =>
          resolve({
            latitude: this.data.latitude,
            longitude: this.data.longitude,
          }),
      });
    });
  },

  async loadCheckinShopMarkers() {
    if (this.data.keyword.trim()) {
      return;
    }

    const center = await this.getCurrentCenterLocation();
    const centerLat = toNumber(center.latitude, this.data.latitude);
    const centerLng = toNumber(center.longitude, this.data.longitude);
    const radiusKm = this.data.radiusOptions[this.data.radiusIndex] || 10;
    const maxDistance = radiusKm * 1000;

    try {
      // 直接走无索引查询，避免 checkinCount 索引缺失导致的超时。
      const queryRes = await db
        .collection("shops")
        .limit(200)
        .get();

      const shops = (queryRes.data || [])
        .map((item) => {
          const checkinCount = toNumber(item.checkinCount, 0);
          if (checkinCount <= 0) {
            return null;
          }
          const latitude = toNumber(item.latitude, NaN);
          const longitude = toNumber(item.longitude, NaN);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          const distance = haversineDistance(centerLat, centerLng, latitude, longitude);
          if (distance > maxDistance) {
            return null;
          }
          return {
            ...item,
            distance,
            location: {
              latitude,
              longitude,
            },
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

      this.setData({
        searched: false,
        shops: [],
        selectedShop: null,
        selectedShopIndex: -1,
        errorMessage: "",
      });
      this.applyMarkers(shops);
    } catch (error) {
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "加载已打卡店铺标注失败",
      });
    }
  },

  handleKeywordInput(event) {
    const keyword = (event.detail.value || "").trim();
    this.setData({ keyword: event.detail.value || "" });

    if (!keyword && this.data.searched) {
      this.loadCheckinShopMarkers().catch(() => {});
    }
  },

  handleRadiusChange(event) {
    this.setData({
      radiusIndex: Number(event.detail.value),
    });

    if (!this.data.keyword.trim()) {
      this.loadCheckinShopMarkers().catch(() => {});
    }
  },

  handleResultCountChange(event) {
    this.setData({
      resultCountIndex: Number(event.detail.value),
    });
  },

  handleOpenFilterPanel() {
    this.setData({
      filterVisible: true,
    });
  },

  handleCloseFilterPanel() {
    this.setData({
      filterVisible: false,
    });
  },

  buildFilterSummary(categories, price, sort) {
    const categoryPart = categories.length ? `分类:${categories.join("、")}` : "不限分类";
    const priceMap = this.data.priceOptions.reduce((acc, item) => {
      acc[item.value] = item.label;
      return acc;
    }, {});
    const sortMap = this.data.sortOptions.reduce((acc, item) => {
      acc[item.value] = item.label;
      return acc;
    }, {});
    const pricePart = priceMap[price] || "不限价格";
    const sortPart = sortMap[sort] || "距离优先";
    return `${categoryPart} / ${pricePart} / ${sortPart}`;
  },

  handleApplyFilter(event) {
    const detail = event.detail || {};
    const categories = Array.isArray(detail.categories) ? detail.categories : [];
    const price = detail.price || "all";
    const sort = detail.sort || "distance_asc";

    this.setData({
      filterVisible: false,
      selectedCategories: categories,
      selectedPrice: price,
      selectedSort: sort,
      filterSummary: this.buildFilterSummary(categories, price, sort),
    });

    if (this.data.keyword.trim()) {
      this.handleSearch().catch(() => {});
    }
  },

  async handleSearch() {
    const keyword = this.data.keyword.trim();
    if (!keyword) {
      wx.showToast({
        title: "请先输入关键词",
        icon: "none",
      });
      return;
    }

    const radiusKm = this.data.radiusOptions[this.data.radiusIndex];
    const resultLimit = this.data.resultCountOptions[this.data.resultCountIndex];

    this.setData({
      searching: true,
      loading: true,
      searched: true,
      errorMessage: "",
      selectedShop: null,
      selectedShopIndex: -1,
    });

    try {
      const center = await this.getCurrentCenterLocation();
      this.setData({
        latitude: center.latitude,
        longitude: center.longitude,
      });

      const result = await wx.cloud.callFunction({
        name: "shop",
        data: {
          action: "search",
          keyword,
          radiusKm,
          resultLimit,
          latitude: center.latitude,
          longitude: center.longitude,
          categoryFilters: this.data.selectedCategories,
          priceRangeKey: this.data.selectedPrice,
          sortBy: this.data.selectedSort,
        },
      });

      const payload = result.result || {};
      const shops = payload.shops || [];
      const selected = shops[0] || null;

      this.setData({
        shops,
        selectedShop: selected,
        selectedShopIndex: selected ? 0 : -1,
        errorMessage: payload.message || "",
      });
      this.applyMarkers(shops);

      if (selected) {
        this.focusShopOnMap(selected);
      }
    } catch (error) {
      this.setData({
        shops: [],
        markers: [],
        selectedShop: null,
        selectedShopIndex: -1,
        errorMessage: (error && (error.errMsg || error.message)) || "检索失败，请稍后重试。",
      });
    } finally {
      this.setData({
        searching: false,
        loading: false,
      });
    }
  },

  handleMarkerTap(event) {
    const markerId = event.detail.markerId;
    const shop = this.markerShopMap.get(markerId);
    if (!shop) {
      return;
    }

    const selectedShopIndex = this.data.searched
      ? this.data.shops.findIndex((item) => item._id === shop._id)
      : -1;

    this.setData({
      selectedShop: shop,
      selectedShopIndex,
    });
    this.focusShopOnMap(shop);
  },

  handleSelectShop(event) {
    const shopIndex = Number(event.currentTarget.dataset.index);
    const shop = this.data.shops[shopIndex];
    if (!shop) {
      return;
    }
    this.setData({
      selectedShop: shop,
      selectedShopIndex: shopIndex,
    });
    this.focusShopOnMap(shop);
  },

  handleCardDetailTap() {
    const { selectedShop } = this.data;
    if (!selectedShop) {
      return;
    }
    wx.navigateTo({
      url:
        `/pages/shopDetail/index?shopId=${selectedShop._id || ""}` +
        `&shopName=${encodeURIComponent(selectedShop.name || "")}`,
    });
  },

  async handleMoveToCurrentLocation() {
    try {
      const location = await this.getUserLocation();
      this.setData({
        latitude: location.latitude,
        longitude: location.longitude,
        locationDenied: false,
      });
      if (this.mapContext) {
        this.mapContext.moveToLocation();
      }

      if (!this.data.keyword.trim()) {
        this.loadCheckinShopMarkers().catch(() => {});
      }
    } catch (error) {
      this.setData({
        locationDenied: true,
        errorMessage: "重新定位失败，请确认定位权限已开启。",
      });
    }
  },

  handleOpenSetting() {
    wx.openSetting();
  },

  handleMapRegionChange(event) {
    if (this.data.keyword.trim()) {
      return;
    }
    if (!event || event.type !== "end") {
      return;
    }

    clearTimeout(this.mapMoveTimer);
    this.mapMoveTimer = setTimeout(() => {
      this.loadCheckinShopMarkers().catch(() => {});
    }, 220);
  },

  async handleGoAddShop() {
    const center = await this.getCurrentCenterLocation();
    const keyword = this.data.keyword.trim();

    wx.navigateTo({
      url:
        `/pages/addShop/index?latitude=${center.latitude}&longitude=${center.longitude}` +
        `&keyword=${encodeURIComponent(keyword)}`,
      success: (res) => {
        res.eventChannel.on("shopAdded", ({ shop }) => {
          if (!shop) {
            return;
          }
          const shops = [shop, ...this.data.shops.filter((item) => item._id !== shop._id)];
          this.setData({
            shops,
            selectedShop: shop,
            selectedShopIndex: 0,
            searched: true,
          });
          this.applyMarkers(shops);
          this.focusShopOnMap(shop);
        });
      },
    });
  },
});
