const MAX_IMAGES = 3;
const MAX_MEAL_IMAGES = 3;

function extFromPath(path = "") {
  const matched = path.match(/\.([a-zA-Z0-9]+)(\?|$)/);
  return matched ? matched[1].toLowerCase() : "jpg";
}

Page({
  data: {
    shopId: "",
    shopName: "",
    isLoggedIn: false,
    userProfile: null,
    loginModalVisible: false,
    loginSubmitting: false,
    submitting: false,
    recommend: null,
    rating: 0,
    content: "",
    dishName: "",
    avgPrice: "",
    images: [],
    mealImages: [],
    hint: "",
  },

  onLoad(options) {
    this.setData({
      shopId: options.shopId || "",
      shopName: decodeURIComponent(options.shopName || ""),
    });
  },

  onShow() {
    const app = getApp();
    const isLoggedIn = !!app.globalData.isLoggedIn;

    this.setData({
      isLoggedIn,
      userProfile: app.globalData.userProfile || null,
      loginModalVisible: !isLoggedIn,
    });
  },

  handleCloseLoginModal() {
    if (this.data.loginSubmitting) {
      return;
    }
    this.setData({
      loginModalVisible: false,
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
      this.setData({
        isLoggedIn: true,
        userProfile: app.globalData.userProfile || null,
        loginModalVisible: false,
      });
      wx.showToast({
        title: "登录成功",
        icon: "success",
      });
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

  handleRatingChange(event) {
    this.setData({
      rating: Number((event.detail && event.detail.value) || 0),
    });
  },

  handleRecommendChange(event) {
    const value = event.currentTarget.dataset.value;
    if (value !== "yes" && value !== "no") {
      return;
    }
    this.setData({
      recommend: value === "yes",
    });
  },

  handleContentInput(event) {
    this.setData({
      content: event.detail.value || "",
    });
  },

  handleAvgPriceInput(event) {
    this.setData({
      avgPrice: event.detail.value || "",
    });
  },

  handleDishNameInput(event) {
    this.setData({
      dishName: event.detail.value || "",
    });
  },

  async handleChooseImage() {
    const remain = MAX_IMAGES - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({
        title: `最多上传 ${MAX_IMAGES} 张`,
        icon: "none",
      });
      return;
    }

    try {
      const res = await wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });

      const files = (res.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
      this.setData({
        images: [...this.data.images, ...files].slice(0, MAX_IMAGES),
      });
    } catch (error) {
      if (String(error.errMsg || "").includes("cancel")) {
        return;
      }
      wx.showToast({
        title: "选择图片失败",
        icon: "none",
      });
    }
  },

  async handleChooseMealImage() {
    const remain = MAX_MEAL_IMAGES - this.data.mealImages.length;
    if (remain <= 0) {
      wx.showToast({
        title: `最多上传 ${MAX_MEAL_IMAGES} 张`,
        icon: "none",
      });
      return;
    }

    try {
      const res = await wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });

      const files = (res.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
      this.setData({
        mealImages: [...this.data.mealImages, ...files].slice(0, MAX_MEAL_IMAGES),
      });
    } catch (error) {
      if (String(error.errMsg || "").includes("cancel")) {
        return;
      }
      wx.showToast({
        title: "选择餐品图片失败",
        icon: "none",
      });
    }
  },

  handleRemoveImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    this.setData({
      images: this.data.images.filter((_, idx) => idx !== index),
    });
  },

  handleRemoveMealImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    this.setData({
      mealImages: this.data.mealImages.filter((_, idx) => idx !== index),
    });
  },

  handlePreviewImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) {
      return;
    }
    wx.previewImage({
      current,
      urls: this.data.images,
    });
  },

  handlePreviewMealImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) {
      return;
    }
    wx.previewImage({
      current,
      urls: this.data.mealImages,
    });
  },

  async compressImageMaybe(filePath) {
    try {
      const compressed = await wx.compressImage({
        src: filePath,
        quality: 72,
      });
      return compressed.tempFilePath || filePath;
    } catch (error) {
      return filePath;
    }
  },

  async uploadImages(paths, folder = "images") {
    if (!paths.length) {
      return [];
    }

    const uploaded = [];
    for (let index = 0; index < paths.length; index += 1) {
      const rawPath = paths[index];
      const tempPath = await this.compressImageMaybe(rawPath);
      const ext = extFromPath(tempPath);
      const cloudPath = `checkins/${this.data.shopId}/${folder}/${Date.now()}-${index}.${ext}`;

      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      });
      uploaded.push(res.fileID);
    }
    return uploaded;
  },

  async handleSubmit() {
    if (!this.data.shopId) {
      wx.showToast({
        title: "缺少店铺信息，无法发布",
        icon: "none",
      });
      return;
    }

    if (!this.data.isLoggedIn) {
      this.setData({
        loginModalVisible: true,
      });
      return;
    }

    if (this.data.recommend === null) {
      wx.showToast({
        title: "请先选择推荐或不推荐",
        icon: "none",
      });
      return;
    }
    const rating = Number(this.data.rating || 0);
    if (rating < 0 || rating > 5) {
      wx.showToast({
        title: "评分范围不正确",
        icon: "none",
      });
      return;
    }

    const avgPrice = String(this.data.avgPrice || "").trim();
    const avgPriceNumber = avgPrice ? Number(avgPrice) : 0;
    if (avgPrice && (!Number.isFinite(avgPriceNumber) || avgPriceNumber < 0)) {
      wx.showToast({
        title: "人均消费格式不正确",
        icon: "none",
      });
      return;
    }

    this.setData({
      submitting: true,
      hint: "正在上传图片并提交...",
    });

    try {
      const imageFileIDs = await this.uploadImages(this.data.images, "review");
      const mealImageFileIDs = await this.uploadImages(this.data.mealImages, "meal");
      const result = await wx.cloud.callFunction({
        name: "checkin",
        data: {
          action: "create",
          shopId: this.data.shopId,
          shopName: this.data.shopName,
          recommend: this.data.recommend,
          rating,
          avgPrice: avgPriceNumber,
          content: String(this.data.content || "").trim(),
          dishName: String(this.data.dishName || "").trim(),
          images: imageFileIDs,
          mealImages: mealImageFileIDs,
        },
      });

      const checkin = (result.result && result.result.checkin) || null;
      const eventChannel = this.getOpenerEventChannel();
      eventChannel.emit("checkinCreated", { checkin });

      wx.showToast({
        title: "打卡发布成功",
        icon: "success",
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 420);
    } catch (error) {
      wx.showToast({
        title: (error && (error.errMsg || error.message)) || "发布失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({
        submitting: false,
        hint: "",
      });
    }
  },
});
