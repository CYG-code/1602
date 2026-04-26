const db = wx.cloud.database();

Page({
  data: {
    shopId: "",
    shareCheckinId: "",
    loading: true,
    errorMessage: "",
    shop: null,
    hasPhone: false,
    canOpenLocation: false,
    canEditShop: false,
    displayRating: "暂无评分",
    displayAvgPrice: "暂无人均",
    isFavorited: false,
    favoriting: false,
    loginModalVisible: false,
    loginSubmitting: false,
    pendingAction: "",
    pendingLikeCheckinId: "",
    pendingCommentCheckinId: "",
    checkins: [],
    checkinsPage: 1,
    checkinsHasMore: false,
    checkinsLoading: false,
    checkinsError: "",
    activeCommentCheckinId: "",
    comments: [],
    commentsLoading: false,
    commentsError: "",
    commentInput: "",
    commentSubmitting: false,
    replyTo: null,
    deletingCheckinId: "",
    deletingCommentId: "",
  },

  onLoad(options) {
    const shopId = options.shopId || "";
    const shopName = decodeURIComponent(options.shopName || "");
    const shareCheckinId = options.checkinId || "";

    this.setData({
      shopId,
      shareCheckinId,
      shop: shopName
        ? {
            name: shopName,
          }
        : null,
    });

    if (!shopId) {
      this.setData({
        loading: false,
        errorMessage: "缺少 shopId 参数，无法加载店铺详情。",
      });
      return;
    }

    this.refreshAll();
  },

  onPullDownRefresh() {
    this.refreshAll().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async refreshAll() {
    await this.loadShopDetail(this.data.shopId);
    await this.loadEditorPermission();
    await this.loadCheckins({ refresh: true });
    await this.loadFavoriteStatus();
    if (this.data.activeCommentCheckinId) {
      await this.loadComments(this.data.activeCommentCheckinId);
    }
  },

  async loadEditorPermission() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({ canEditShop: false });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: "shop",
        data: {
          action: "getEditorPermission",
          shopId: this.data.shopId,
        },
      });
      const payload = res.result || {};
      this.setData({
        canEditShop: !!payload.canEdit,
      });
    } catch (error) {
      this.setData({ canEditShop: false });
    }
  },

  buildShareImage(urls = []) {
    const first = Array.isArray(urls) ? urls.find((url) => /^https?:\/\//i.test(url || "")) : "";
    return first || "";
  },

  getShopShareConfig() {
    const shop = this.data.shop || {};
    const name = shop.name || "美食店铺";
    const rating = Number(shop.avgRating || 0);
    const ratingText = rating > 0 ? `评分 ${rating.toFixed(1)}` : "欢迎来打卡";
    const title = `${name} · ${ratingText}`;
    const path =
      `/pages/shopDetail/index?shopId=${this.data.shopId}` +
      `&shopName=${encodeURIComponent(name)}`;

    const imageUrl = this.buildShareImage([
      ...(Array.isArray(shop.images) ? shop.images : []),
      shop.coverUrl,
      shop.imageUrl,
      shop.bannerUrl,
    ]);
    const config = { title, path };
    if (imageUrl) {
      config.imageUrl = imageUrl;
    }
    return config;
  },

  getCheckinShareConfig(checkinId) {
    const checkin = (this.data.checkins || []).find((item) => item._id === checkinId);
    if (!checkin) {
      return this.getShopShareConfig();
    }

    const shop = this.data.shop || {};
    const shopName = shop.name || checkin.shopName || "美食店铺";
    const recommendText = checkin.recommend === false ? "不推荐" : "推荐";
    const content = String(checkin.content || "").trim();
    const snippet = content ? `：${content.slice(0, 24)}` : "";
    const title = `${recommendText} | ${shopName}${snippet}`;
    const path =
      `/pages/shopDetail/index?shopId=${this.data.shopId}` +
      `&shopName=${encodeURIComponent(shopName)}` +
      `&checkinId=${checkin._id}`;

    const imageUrl = this.buildShareImage([
      ...(Array.isArray(checkin.mealImages) ? checkin.mealImages : []),
      ...(Array.isArray(checkin.images) ? checkin.images : []),
    ]);

    const config = { title, path };
    if (imageUrl) {
      config.imageUrl = imageUrl;
    }
    return config;
  },

  onShareAppMessage(res) {
    const fromButton = res && res.from === "button";
    const checkinId =
      fromButton && res && res.target && res.target.dataset ? res.target.dataset.checkinId || "" : "";
    if (checkinId) {
      return this.getCheckinShareConfig(checkinId);
    }
    return this.getShopShareConfig();
  },

  onShareTimeline() {
    const shop = this.data.shop || {};
    const title = `${shop.name || "美食店铺"} · 附近美食地图`;
    const query = `shopId=${this.data.shopId}&shopName=${encodeURIComponent(shop.name || "")}`;
    const imageUrl = this.buildShareImage([
      ...(Array.isArray(shop.images) ? shop.images : []),
      shop.coverUrl,
      shop.imageUrl,
      shop.bannerUrl,
    ]);
    const config = { title, query };
    if (imageUrl) {
      config.imageUrl = imageUrl;
    }
    return config;
  },

  handlePreviewShopImage(event) {
    const current = event.currentTarget.dataset.url;
    const shop = this.data.shop || {};
    const urls = Array.isArray(shop.images) ? shop.images.filter(Boolean) : [];
    if (!current || urls.length === 0) {
      return;
    }
    wx.previewImage({
      current,
      urls,
    });
  },

  async loadShopDetail(shopId) {
    this.setData({
      loading: true,
      errorMessage: "",
    });

    try {
      const result = await db.collection("shops").doc(shopId).get();
      const shop = result.data || null;

      if (!shop) {
        this.setData({
          loading: false,
          errorMessage: "未找到店铺信息。",
        });
        return;
      }

      const avgRating = Number(shop.avgRating || 0);
      const avgPrice = Number(shop.avgPrice || 0);
      const phone = shop.phone || shop.tel || "";

      this.setData({
        loading: false,
        shop,
        hasPhone: Boolean(phone),
        canOpenLocation: Number.isFinite(Number(shop.latitude)) && Number.isFinite(Number(shop.longitude)),
        displayRating: avgRating > 0 ? avgRating.toFixed(1) : "暂无评分",
        displayAvgPrice: avgPrice > 0 ? `¥${avgPrice.toFixed(0)}` : "暂无人均",
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: (error && (error.errMsg || error.message)) || "加载店铺详情失败。",
      });
    }
  },

  async loadFavoriteStatus() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({ isFavorited: false });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: "user",
        data: {
          action: "getFavoriteStatus",
          shopId: this.data.shopId,
        },
      });
      const payload = res.result || {};
      this.setData({
        isFavorited: !!payload.favorited,
      });
    } catch (error) {
      this.setData({ isFavorited: false });
    }
  },

  async loadCheckins({ refresh = false } = {}) {
    if (this.data.checkinsLoading) {
      return;
    }

    const page = refresh ? 1 : this.data.checkinsPage;
    if (!refresh && !this.data.checkinsHasMore && this.data.checkins.length > 0) {
      return;
    }

    this.setData({
      checkinsLoading: true,
      checkinsError: "",
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "checkin",
        data: {
          action: "getByShop",
          shopId: this.data.shopId,
          page,
          pageSize: 10,
        },
      });

      const payload = res.result || {};
      const list = payload.list || [];
      const nextList = refresh ? list : [...this.data.checkins, ...list];

      this.setData({
        checkins: nextList,
        checkinsPage: page + 1,
        checkinsHasMore: !!payload.hasMore,
      });
    } catch (error) {
      this.setData({
        checkinsError: (error && (error.errMsg || error.message)) || "加载打卡失败",
      });
    } finally {
      this.setData({
        checkinsLoading: false,
      });
    }
  },

  async loadComments(checkinId) {
    this.setData({
      commentsLoading: true,
      commentsError: "",
    });
    try {
      const res = await wx.cloud.callFunction({
        name: "comment",
        data: {
          action: "getByCheckin",
          checkinId,
          page: 1,
          pageSize: 50,
        },
      });
      const payload = res.result || {};
      this.setData({
        comments: payload.list || [],
      });
    } catch (error) {
      this.setData({
        commentsError: (error && (error.errMsg || error.message)) || "加载评论失败",
      });
    } finally {
      this.setData({
        commentsLoading: false,
      });
    }
  },

  handleLoadMoreCheckins() {
    this.loadCheckins({ refresh: false });
  },

  handleRetry() {
    if (!this.data.shopId) {
      return;
    }
    this.refreshAll();
  },

  handleCallPhone() {
    const phone = (this.data.shop && (this.data.shop.phone || this.data.shop.tel)) || "";
    if (!phone) {
      wx.showToast({
        title: "暂无联系电话",
        icon: "none",
      });
      return;
    }

    wx.makePhoneCall({
      phoneNumber: phone,
    });
  },

  handleOpenLocation() {
    const { shop } = this.data;
    if (!shop) {
      return;
    }

    const latitude = Number(shop.latitude);
    const longitude = Number(shop.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({
        title: "暂无可导航坐标",
        icon: "none",
      });
      return;
    }

    wx.openLocation({
      latitude,
      longitude,
      name: shop.name || "店铺",
      address: shop.address || "",
      scale: 18,
    });
  },

  handleGoPostCheckin() {
    if (!this.data.shopId) {
      return;
    }

    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({
        loginModalVisible: true,
        pendingAction: "checkin",
      });
      return;
    }

    this.navigateToPostCheckin();
  },

  handleGoEditShop() {
    if (!this.data.canEditShop || !this.data.shopId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/addShop/index?mode=edit&shopId=${this.data.shopId}`,
      success: (res) => {
        res.eventChannel.on("shopUpdated", ({ shop }) => {
          if (!shop) {
            return;
          }
          this.setData({
            shop: {
              ...(this.data.shop || {}),
              ...shop,
            },
          });
          this.refreshAll();
        });
      },
    });
  },

  navigateToPostCheckin() {
    const { shopId, shop } = this.data;
    wx.navigateTo({
      url:
        `/pages/postCheckin/index?shopId=${shopId}` +
        `&shopName=${encodeURIComponent((shop && shop.name) || "")}`,
      success: (res) => {
        res.eventChannel.on("checkinCreated", () => {
          this.refreshAll();
        });
      },
    });
  },

  handleToggleFavorite() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({
        loginModalVisible: true,
        pendingAction: "favorite",
      });
      return;
    }
    this.toggleFavorite();
  },

  async toggleFavorite() {
    if (this.data.favoriting) {
      return;
    }
    this.setData({
      favoriting: true,
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "user",
        data: {
          action: "toggleFavorite",
          shopId: this.data.shopId,
        },
      });
      const payload = res.result || {};
      const isFavorited = !!payload.favorited;
      this.setData({
        isFavorited,
      });
      wx.showToast({
        title: isFavorited ? "已收藏" : "已取消收藏",
        icon: "none",
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "收藏操作失败",
        icon: "none",
      });
    } finally {
      this.setData({
        favoriting: false,
      });
    }
  },

  handleCheckinLikeTap(event) {
    const checkinId = (event.detail && event.detail.checkinId) || "";
    if (!checkinId) {
      return;
    }

    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({
        loginModalVisible: true,
        pendingAction: "like",
        pendingLikeCheckinId: checkinId,
      });
      return;
    }

    this.toggleLike(checkinId);
  },

  async toggleLike(checkinId) {
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

  handleCheckinCommentTap(event) {
    const checkinId = (event.detail && event.detail.checkinId) || "";
    if (!checkinId) {
      return;
    }

    const nextActive = this.data.activeCommentCheckinId === checkinId ? "" : checkinId;
    this.setData({
      activeCommentCheckinId: nextActive,
      comments: [],
      commentsError: "",
      commentInput: "",
      replyTo: null,
    });

    if (nextActive) {
      this.loadComments(nextActive);
    }
  },

  handleCheckinDeleteTap(event) {
    const checkinId = (event.detail && event.detail.checkinId) || "";
    if (!checkinId || this.data.deletingCheckinId) {
      return;
    }

    wx.showModal({
      title: "删除打卡",
      content: "删除后会同时删除该打卡下的评论和点赞，是否继续？",
      success: ({ confirm }) => {
        if (!confirm) {
          return;
        }
        this.deleteCheckin(checkinId);
      },
    });
  },

  async deleteCheckin(checkinId) {
    this.setData({ deletingCheckinId: checkinId });
    try {
      await wx.cloud.callFunction({
        name: "checkin",
        data: {
          action: "delete",
          checkinId,
        },
      });

      const activeDeleted = this.data.activeCommentCheckinId === checkinId;
      this.setData({
        checkins: this.data.checkins.filter((item) => item._id !== checkinId),
        activeCommentCheckinId: activeDeleted ? "" : this.data.activeCommentCheckinId,
        comments: activeDeleted ? [] : this.data.comments,
        commentsError: activeDeleted ? "" : this.data.commentsError,
      });

      await this.loadShopDetail(this.data.shopId);
      wx.showToast({
        title: "打卡已删除",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "删除失败，请稍后重试",
        icon: "none",
      });
    } finally {
      this.setData({ deletingCheckinId: "" });
    }
  },

  handleReplyComment(event) {
    const detail = event.detail || {};
    this.setData({
      replyTo: {
        userId: detail.userId || "",
        nickName: detail.nickName || "微信用户",
      },
    });
  },

  handleCancelReply() {
    this.setData({
      replyTo: null,
    });
  },

  handleCommentInput(event) {
    this.setData({
      commentInput: event.detail.value || "",
    });
  },

  async handleSubmitComment() {
    const checkinId = this.data.activeCommentCheckinId;
    if (!checkinId) {
      return;
    }

    const content = (this.data.commentInput || "").trim();
    if (!content) {
      wx.showToast({
        title: "请输入评论内容",
        icon: "none",
      });
      return;
    }

    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      this.setData({
        loginModalVisible: true,
        pendingAction: "comment",
        pendingCommentCheckinId: checkinId,
      });
      return;
    }

    this.setData({
      commentSubmitting: true,
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "comment",
        data: {
          action: "create",
          checkinId,
          content,
          replyTo: this.data.replyTo,
        },
      });
      const payload = res.result || {};
      const newComment = payload.comment || null;
      const nextComments = newComment ? [...this.data.comments, newComment] : this.data.comments;
      const nextCount = Number(payload.commentCount || 0);

      const checkins = this.data.checkins.map((item) => {
        if (item._id !== checkinId) {
          return item;
        }
        return {
          ...item,
          commentCount: nextCount || Number(item.commentCount || 0) + 1,
        };
      });

      this.setData({
        comments: nextComments,
        checkins,
        commentInput: "",
        replyTo: null,
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "评论失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({
        commentSubmitting: false,
      });
    }
  },

  handleCommentDeleteTap(event) {
    const commentId = (event.detail && event.detail.commentId) || "";
    if (!commentId || this.data.deletingCommentId) {
      return;
    }

    wx.showModal({
      title: "删除评论",
      content: "删除后不可恢复，是否继续？",
      success: ({ confirm }) => {
        if (!confirm) {
          return;
        }
        this.deleteComment(commentId);
      },
    });
  },

  async deleteComment(commentId) {
    const checkinId = this.data.activeCommentCheckinId;
    if (!checkinId) {
      return;
    }
    this.setData({ deletingCommentId: commentId });
    try {
      const res = await wx.cloud.callFunction({
        name: "comment",
        data: {
          action: "delete",
          commentId,
        },
      });
      const payload = res.result || {};
      const nextCount = Number(payload.commentCount || 0);

      this.setData({
        comments: this.data.comments.filter((item) => item._id !== commentId),
        checkins: this.data.checkins.map((item) =>
          item._id === checkinId
            ? { ...item, commentCount: Math.max(0, nextCount) }
            : item
        ),
      });

      wx.showToast({
        title: "评论已删除",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "删除失败，请稍后重试",
        icon: "none",
      });
    } finally {
      this.setData({ deletingCommentId: "" });
    }
  },

  handleCloseLoginModal() {
    if (this.data.loginSubmitting) {
      return;
    }
    this.setData({
      loginModalVisible: false,
      pendingAction: "",
      pendingLikeCheckinId: "",
      pendingCommentCheckinId: "",
    });
  },

  async handleLoginSuccess(event) {
    const profile = (event.detail && event.detail.profile) || {};
    const app = getApp();

    this.setData({
      loginSubmitting: true,
    });

    try {
      await app.loginWithProfile(profile);
      wx.showToast({
        title: "登录成功",
        icon: "success",
      });

      const pendingAction = this.data.pendingAction;
      const pendingLikeCheckinId = this.data.pendingLikeCheckinId;
      const pendingCommentCheckinId = this.data.pendingCommentCheckinId;

      this.setData({
        loginModalVisible: false,
        pendingAction: "",
        pendingLikeCheckinId: "",
        pendingCommentCheckinId: "",
      });

      if (pendingAction === "checkin") {
        this.navigateToPostCheckin();
      } else if (pendingAction === "like" && pendingLikeCheckinId) {
        this.toggleLike(pendingLikeCheckinId);
      } else if (pendingAction === "comment" && pendingCommentCheckinId) {
        this.setData({
          activeCommentCheckinId: pendingCommentCheckinId,
        });
        this.loadComments(pendingCommentCheckinId);
      } else if (pendingAction === "favorite") {
        this.toggleFavorite();
      }

      this.loadEditorPermission();
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "登录失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({
        loginSubmitting: false,
      });
    }
  },

  handleLoginError(event) {
    const message = (event.detail && event.detail.message) || "已取消授权";
    wx.showToast({
      title: message,
      icon: "none",
    });
  },
});
