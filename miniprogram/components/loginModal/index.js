Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: "请先登录",
    },
    description: {
      type: String,
      value: "登录后可继续当前操作",
    },
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent("close");
    },

    handlePanelTap() {},

    handleCancel() {
      this.triggerEvent("close");
    },

    async handleConfirmLogin() {
      try {
        const profile = await wx.getUserProfile({
          desc: "用于创建用户资料并完成登录",
        });
        this.triggerEvent("success", {
          profile: profile.userInfo || {},
        });
      } catch (error) {
        if ((error && error.errMsg) || (error && error.message)) {
          this.triggerEvent("error", {
            message: error.errMsg || error.message || "用户取消授权",
          });
        }
      }
    },
  },
});
