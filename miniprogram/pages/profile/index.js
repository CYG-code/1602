Page({
  data: {
    isLoggedIn: false,
    userProfile: null,
    loginModalVisible: false,
    loggingIn: false,
  },

  onShow() {
    this.syncFromGlobal();
  },

  syncFromGlobal() {
    const app = getApp();
    this.setData({
      isLoggedIn: !!app.globalData.isLoggedIn,
      userProfile: app.globalData.userProfile || null,
    });
  },

  handleOpenLogin() {
    this.setData({
      loginModalVisible: true,
    });
  },

  handleCloseLoginModal() {
    if (this.data.loggingIn) {
      return;
    }
    this.setData({
      loginModalVisible: false,
    });
  },

  async handleLoginSuccess(event) {
    const profile = (event.detail && event.detail.profile) || {};
    const app = getApp();
    const wasLoggedIn = !!app.globalData.isLoggedIn;

    this.setData({
      loggingIn: true,
    });

    try {
      await app.loginWithProfile(profile);
      this.syncFromGlobal();
      this.setData({
        loginModalVisible: false,
      });
      wx.showToast({
        title: "登录成功",
        icon: "success",
      });

      if (!wasLoggedIn) {
        setTimeout(() => {
          wx.navigateTo({
            url: "/pages/editProfile/index",
          });
        }, 250);
      }
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "登录失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({
        loggingIn: false,
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

  handleGoMyCheckins() {
    if (!this.data.isLoggedIn) {
      this.handleOpenLogin();
      return;
    }

    wx.navigateTo({
      url: "/pages/myCheckins/index",
    });
  },

  handleGoMyFavorites() {
    if (!this.data.isLoggedIn) {
      this.handleOpenLogin();
      return;
    }

    wx.navigateTo({
      url: "/pages/myFavorites/index",
    });
  },

  handleGoEditProfile() {
    if (!this.data.isLoggedIn) {
      this.handleOpenLogin();
      return;
    }
    wx.navigateTo({
      url: "/pages/editProfile/index",
    });
  },
});
