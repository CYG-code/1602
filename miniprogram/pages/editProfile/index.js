Page({
  data: {
    nickName: "",
    avatarUrl: "",
    saving: false,
  },

  onLoad() {
    const app = getApp();
    const profile = app.globalData.userProfile || {};
    this.setData({
      nickName: profile.nickName || "",
      avatarUrl: profile.avatarUrl || "",
    });
  },

  handleNicknameInput(event) {
    this.setData({
      nickName: event.detail.value || "",
    });
  },

  handleChooseAvatar(event) {
    this.setData({
      avatarUrl: (event.detail && event.detail.avatarUrl) || "",
    });
  },

  async handleSave() {
    const nickName = (this.data.nickName || "").trim();
    const avatarUrl = this.data.avatarUrl || "";

    if (!nickName) {
      wx.showToast({
        title: "请填写昵称",
        icon: "none",
      });
      return;
    }

    this.setData({
      saving: true,
    });

    try {
      const app = getApp();
      await app.updateUserProfile({ nickName, avatarUrl });
      wx.showToast({
        title: "资料已更新",
        icon: "success",
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 300);
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "保存失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({
        saving: false,
      });
    }
  },
});
