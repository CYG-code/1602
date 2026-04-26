Page({
  data: {
    loading: false,
    errorMessage: "",
    shops: [],
    isLoggedIn: false,
  },

  onShow() {
    const app = getApp();
    const isLoggedIn = !!app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (!isLoggedIn) {
      this.setData({
        shops: [],
        errorMessage: "请先登录后查看我的收藏",
      });
      return;
    }

    this.loadFavorites();
  },

  onPullDownRefresh() {
    this.loadFavorites().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadFavorites() {
    if (!this.data.isLoggedIn) {
      return;
    }

    this.setData({
      loading: true,
      errorMessage: "",
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "user",
        data: {
          action: "getFavorites",
        },
      });
      const payload = res.result || {};
      this.setData({
        shops: payload.shops || [],
      });
    } catch (error) {
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "加载收藏失败",
      });
    } finally {
      this.setData({
        loading: false,
      });
    }
  },

  handleOpenDetail(event) {
    const shopId = event.currentTarget.dataset.shopid;
    const shopName = event.currentTarget.dataset.shopname || "";
    if (!shopId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/shopDetail/index?shopId=${shopId}&shopName=${encodeURIComponent(shopName)}`,
    });
  },

  async handleUnfavorite(event) {
    const shopId = event.currentTarget.dataset.shopid;
    if (!shopId) {
      return;
    }

    try {
      await wx.cloud.callFunction({
        name: "user",
        data: {
          action: "toggleFavorite",
          shopId,
        },
      });
      this.setData({
        shops: this.data.shops.filter((item) => item._id !== shopId),
      });
      wx.showToast({
        title: "已取消收藏",
        icon: "none",
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "取消收藏失败",
        icon: "none",
      });
    }
  },
});
