const { envList } = require("./envList");

App({
  onLaunch() {
    const env = envList[0] || "";

    this.globalData = {
      env,
      systemInfo: null,
      isLoggedIn: false,
      userSession: null,
      userProfile: null,
    };

    if (!wx.cloud) {
      console.error("Please use base library 2.2.3 or above for cloud support.");
      return;
    }

    const cloudOptions = { traceUser: true };
    if (env) {
      cloudOptions.env = env;
    }
    wx.cloud.init(cloudOptions);

    wx.getSystemInfo({
      success: ({ safeArea, statusBarHeight, screenHeight }) => {
        this.globalData.systemInfo = {
          safeArea,
          statusBarHeight,
          screenHeight,
        };
      },
    });

    this.refreshUserSession().catch(() => {});
  },

  async loginWithProfile(profile = {}) {
    const nickName = (profile.nickName || "").trim();
    if (!nickName) {
      throw new Error("缺少用户昵称，无法完成登录");
    }

    const res = await wx.cloud.callFunction({
      name: "user",
      data: {
        action: "login",
        nickName,
        avatarUrl: profile.avatarUrl || "",
      },
    });

    const payload = res.result || {};
    this.applyLoginResult(payload);
    return payload;
  },

  async updateUserProfile(profile = {}) {
    const nickName = (profile.nickName || "").trim();
    if (!nickName) {
      throw new Error("昵称不能为空");
    }

    const res = await wx.cloud.callFunction({
      name: "user",
      data: {
        action: "updateProfile",
        nickName,
        avatarUrl: profile.avatarUrl || "",
      },
    });

    const payload = res.result || {};
    this.applyLoginResult(payload);
    return payload;
  },

  applyLoginResult(payload = {}) {
    const openid = payload.openid || (payload.user && payload.user.openid) || "";
    const user = payload.user || null;

    this.globalData.userSession = openid
      ? {
          openid,
          userId: user && user._id ? user._id : "",
        }
      : null;

    this.globalData.userProfile =
      user && user.nickName
        ? {
            nickName: user.nickName,
            avatarUrl: user.avatarUrl || "",
          }
        : null;

    this.globalData.isLoggedIn = Boolean(this.globalData.userProfile && this.globalData.userProfile.nickName);
  },

  async refreshUserSession() {
    const res = await wx.cloud.callFunction({
      name: "user",
      data: {
        action: "getSession",
      },
    });

    const payload = res.result || {};
    this.applyLoginResult(payload);
    return payload;
  },
});
