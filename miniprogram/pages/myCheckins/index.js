Page({
  data: {
    checkins: [],
    loading: false,
    loadingMore: false,
    errorMessage: "",
    hasMore: false,
    page: 1,
    pageSize: 10,
    isLoggedIn: false,
  },

  onShow() {
    const app = getApp();
    const isLoggedIn = !!app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (!isLoggedIn) {
      this.setData({
        checkins: [],
        errorMessage: "请先登录后查看我的打卡",
      });
      return;
    }

    this.loadCheckins({ refresh: true });
  },

  onPullDownRefresh() {
    this.loadCheckins({ refresh: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadCheckins({ refresh = false } = {}) {
    if (!this.data.isLoggedIn) {
      return;
    }
    if (refresh && this.data.loading) {
      return;
    }
    if (!refresh && (this.data.loadingMore || !this.data.hasMore)) {
      return;
    }

    const targetPage = refresh ? 1 : this.data.page;
    this.setData({
      [refresh ? "loading" : "loadingMore"]: true,
      errorMessage: "",
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "checkin",
        data: {
          action: "getByUser",
          page: targetPage,
          pageSize: this.data.pageSize,
        },
      });

      const payload = res.result || {};
      const list = payload.list || [];
      this.setData({
        checkins: refresh ? list : [...this.data.checkins, ...list],
        hasMore: !!payload.hasMore,
        page: targetPage + 1,
      });
    } catch (error) {
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "加载我的打卡失败",
      });
    } finally {
      this.setData({
        loading: false,
        loadingMore: false,
      });
    }
  },

  handleLoadMore() {
    this.loadCheckins({ refresh: false });
  },

  handleGoShopDetail(event) {
    const shopId = event.currentTarget.dataset.shopid;
    const shopName = event.currentTarget.dataset.shopname || "";
    if (!shopId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/shopDetail/index?shopId=${shopId}&shopName=${encodeURIComponent(shopName)}`,
    });
  },

  async handleCheckinLikeTap(event) {
    const checkinId = (event.detail && event.detail.checkinId) || "";
    if (!checkinId) {
      return;
    }
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: "请先登录后再点赞",
        icon: "none",
      });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: "like",
        data: {
          action: "toggle",
          checkinId,
        },
      });
      const payload = res.result || {};
      const checkins = this.data.checkins.map((item) => {
        if (item._id !== checkinId) {
          return item;
        }
        return {
          ...item,
          liked: !!payload.liked,
          likeCount: Number(payload.likeCount || 0),
        };
      });
      this.setData({ checkins });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "点赞失败，请重试",
        icon: "none",
      });
    }
  },

  handleCheckinDeleteTap(event) {
    const checkinId = (event.detail && event.detail.checkinId) || "";
    if (!checkinId) {
      return;
    }

    wx.showModal({
      title: "删除打卡",
      content: "删除后不可恢复，是否继续？",
      success: ({ confirm }) => {
        if (!confirm) {
          return;
        }
        this.deleteCheckin(checkinId);
      },
    });
  },

  async deleteCheckin(checkinId) {
    try {
      await wx.cloud.callFunction({
        name: "checkin",
        data: {
          action: "delete",
          checkinId,
        },
      });
      this.setData({
        checkins: this.data.checkins.filter((item) => item._id !== checkinId),
      });
      wx.showToast({
        title: "打卡已删除",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "删除失败，请稍后重试",
        icon: "none",
      });
    }
  },
});
