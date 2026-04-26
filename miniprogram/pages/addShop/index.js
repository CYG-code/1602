const db = wx.cloud.database();

const DEFAULT_TAGS = ["中餐", "烧烤", "火锅", "小吃", "甜品", "咖啡", "饮品", "西餐"];
const PLACE_TYPES = ["店铺", "小摊"];
const MAX_SHOP_IMAGES = 3;

function normalizeTag(tag) {
  return String(tag || "").trim();
}

function extFromPath(path = "") {
  const matched = path.match(/\.([a-zA-Z0-9]+)(\?|$)/);
  return matched ? matched[1].toLowerCase() : "jpg";
}

function isRemoteFile(path = "") {
  return /^cloud:\/\//i.test(path) || /^https?:\/\//i.test(path);
}

Page({
  data: {
    mode: "create",
    shopId: "",
    loadingShop: false,
    loadingAddress: false,
    submitting: false,
    errorMessage: "",
    successHint: "",

    shopName: "",
    phone: "",
    addressInput: "",
    manualAddressEdited: false,
    suggestedAddress: "",

    placeTypes: PLACE_TYPES,
    placeTypeIndex: 0,

    allTags: DEFAULT_TAGS,
    selectedTags: [],
    tagQuery: "",
    filteredTags: DEFAULT_TAGS,
    showTagPanel: false,

    latitude: 31.2304,
    longitude: 121.4737,
    scale: 17,
    markers: [],

    shopImages: [],
  },

  onLoad(options) {
    const mode = options.mode === "edit" ? "edit" : "create";
    const shopId = options.shopId || "";
    const latitude = Number(options.latitude);
    const longitude = Number(options.longitude);
    const keyword = decodeURIComponent(options.keyword || "");

    const nextLat = Number.isFinite(latitude) ? latitude : this.data.latitude;
    const nextLng = Number.isFinite(longitude) ? longitude : this.data.longitude;

    this.setData({
      mode,
      shopId,
      latitude: nextLat,
      longitude: nextLng,
      shopName: keyword,
      markers: [this.buildCenterMarker(nextLat, nextLng)],
    });

    wx.setNavigationBarTitle({
      title: mode === "edit" ? "编辑店铺" : "新增店铺",
    });
  },

  async onReady() {
    this.mapContext = wx.createMapContext("addShopMap", this);
    if (this.data.mode === "edit") {
      await this.loadShopForEdit();
      return;
    }
    this.loadSuggestedAddress(this.data.latitude, this.data.longitude);
  },

  buildCenterMarker(latitude, longitude) {
    return {
      id: 1,
      latitude,
      longitude,
      iconPath: "/images/icons/home-active.png",
      width: 30,
      height: 30,
    };
  },

  async loadShopForEdit() {
    if (!this.data.shopId) {
      this.setData({ errorMessage: "缺少 shopId，无法编辑店铺。" });
      return;
    }

    this.setData({
      loadingShop: true,
      errorMessage: "",
    });

    try {
      const permissionRes = await wx.cloud.callFunction({
        name: "shop",
        data: {
          action: "getEditorPermission",
          shopId: this.data.shopId,
        },
      });
      const permission = permissionRes.result || {};
      if (!permission.canEdit) {
        throw new Error("你没有编辑该店铺的权限");
      }

      const res = await db.collection("shops").doc(this.data.shopId).get();
      const shop = res.data || null;
      if (!shop) {
        throw new Error("店铺不存在");
      }

      const lat = Number(shop.latitude);
      const lng = Number(shop.longitude);
      const safeLat = Number.isFinite(lat) ? lat : this.data.latitude;
      const safeLng = Number.isFinite(lng) ? lng : this.data.longitude;
      const tags = Array.isArray(shop.tags)
        ? shop.tags.filter(Boolean)
        : shop.category
          ? [shop.category]
          : [];
      const allTags = [...new Set([...DEFAULT_TAGS, ...tags])];
      const placeTypeIndex = Math.max(
        0,
        this.data.placeTypes.findIndex((item) => item === (shop.placeType || "店铺"))
      );
      const images = Array.isArray(shop.images) ? shop.images.filter(Boolean).slice(0, 3) : [];

      this.setData({
        shopName: shop.name || "",
        phone: shop.phone || "",
        addressInput: shop.address || "",
        manualAddressEdited: true,
        suggestedAddress: shop.address || "",
        placeTypeIndex: placeTypeIndex < 0 ? 0 : placeTypeIndex,
        allTags,
        selectedTags: tags,
        filteredTags: allTags,
        latitude: safeLat,
        longitude: safeLng,
        markers: [this.buildCenterMarker(safeLat, safeLng)],
        shopImages: images,
      });

      this.loadSuggestedAddress(safeLat, safeLng);
    } catch (error) {
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "加载店铺信息失败",
      });
    } finally {
      this.setData({ loadingShop: false });
    }
  },

  handleNameInput(event) {
    this.setData({ shopName: event.detail.value || "" });
  },

  handlePhoneInput(event) {
    this.setData({ phone: event.detail.value || "" });
  },

  handleAddressInput(event) {
    this.setData({
      addressInput: event.detail.value || "",
      manualAddressEdited: true,
    });
  },

  handlePlaceTypeChange(event) {
    this.setData({ placeTypeIndex: Number(event.currentTarget.dataset.index) });
  },

  handleTagFocus() {
    this.setData({ showTagPanel: true });
    this.updateFilteredTags(this.data.tagQuery);
  },

  handleTagBlur() {
    setTimeout(() => this.setData({ showTagPanel: false }), 120);
  },

  handleTagInput(event) {
    const tagQuery = event.detail.value || "";
    this.setData({ tagQuery, showTagPanel: true });
    this.updateFilteredTags(tagQuery);
  },

  handleTagConfirm() {
    const tag = normalizeTag(this.data.tagQuery);
    if (!tag) {
      return;
    }
    this.addTagToSelection(tag);
  },

  updateFilteredTags(tagQuery) {
    const query = normalizeTag(tagQuery).toLowerCase();
    const filtered = this.data.allTags.filter((tag) => !query || tag.toLowerCase().includes(query));
    this.setData({ filteredTags: filtered });
  },

  addTagToSelection(tagInput) {
    const tag = normalizeTag(tagInput);
    if (!tag) {
      return;
    }
    const allTags = this.data.allTags.includes(tag) ? this.data.allTags : [...this.data.allTags, tag];
    const selectedTags = this.data.selectedTags.includes(tag)
      ? this.data.selectedTags
      : [...this.data.selectedTags, tag];

    this.setData({
      allTags,
      selectedTags,
      tagQuery: "",
      filteredTags: allTags,
      showTagPanel: true,
    });
  },

  handleSelectSuggestedTag(event) {
    this.addTagToSelection(event.currentTarget.dataset.tag);
  },

  handleCreateTag() {
    this.addTagToSelection(this.data.tagQuery);
  },

  handleRemoveSelectedTag(event) {
    const tag = event.currentTarget.dataset.tag;
    this.setData({
      selectedTags: this.data.selectedTags.filter((item) => item !== tag),
    });
  },

  async handleChooseShopImage() {
    const remain = MAX_SHOP_IMAGES - this.data.shopImages.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传 ${MAX_SHOP_IMAGES} 张`, icon: "none" });
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
        shopImages: [...this.data.shopImages, ...files].slice(0, MAX_SHOP_IMAGES),
      });
    } catch (error) {
      if (String(error.errMsg || "").includes("cancel")) {
        return;
      }
      wx.showToast({ title: "选择图片失败", icon: "none" });
    }
  },

  handleRemoveShopImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }
    this.setData({
      shopImages: this.data.shopImages.filter((_, idx) => idx !== index),
    });
  },

  handlePreviewShopImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) {
      return;
    }
    wx.previewImage({ current, urls: this.data.shopImages });
  },

  handleUseSuggestedAddress() {
    if (!this.data.suggestedAddress) {
      return;
    }
    this.setData({
      addressInput: this.data.suggestedAddress,
      manualAddressEdited: false,
    });
  },

  async handleUseCurrentLocation() {
    try {
      const location = await new Promise((resolve, reject) => {
        wx.getLocation({
          type: "gcj02",
          success: resolve,
          fail: reject,
        });
      });
      this.setData({
        latitude: location.latitude,
        longitude: location.longitude,
        markers: [this.buildCenterMarker(location.latitude, location.longitude)],
        successHint: "已定位到当前位置",
      });
      if (this.mapContext) {
        this.mapContext.moveToLocation();
      }
      this.loadSuggestedAddress(location.latitude, location.longitude);
    } catch (error) {
      this.setData({ errorMessage: "定位失败，请确认定位权限后重试。" });
    }
  },

  handleRegionChange(event) {
    if (event.type !== "end" || (event.causedBy !== "drag" && event.causedBy !== "scale")) {
      return;
    }
    if (!this.mapContext) {
      return;
    }

    this.mapContext.getCenterLocation({
      success: (res) => {
        const latitude = Number(res.latitude);
        const longitude = Number(res.longitude);
        this.setData({
          latitude,
          longitude,
          markers: [this.buildCenterMarker(latitude, longitude)],
          successHint: "已更新选点坐标",
        });
        this.loadSuggestedAddress(latitude, longitude);
      },
    });
  },

  async loadSuggestedAddress(latitude, longitude) {
    this.setData({
      loadingAddress: true,
      errorMessage: "",
    });
    try {
      const result = await wx.cloud.callFunction({
        name: "shop",
        data: {
          action: "reverseGeocode",
          latitude,
          longitude,
        },
      });
      const payload = result.result || {};
      const suggested = payload.address || "";
      this.setData({ suggestedAddress: suggested });
      if (!this.data.manualAddressEdited || !this.data.addressInput.trim()) {
        this.setData({ addressInput: suggested });
      }
    } catch (error) {
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "地址推荐失败，请手动填写。",
      });
    } finally {
      this.setData({ loadingAddress: false });
    }
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

  async uploadShopImages(paths, name) {
    if (!paths.length) {
      return [];
    }

    const uploaded = [];
    for (let index = 0; index < paths.length; index += 1) {
      const rawPath = paths[index];
      if (isRemoteFile(rawPath)) {
        uploaded.push(rawPath);
        continue;
      }
      const tempPath = await this.compressImageMaybe(rawPath);
      const ext = extFromPath(tempPath);
      const safeName = encodeURIComponent((name || "shop").slice(0, 20));
      const cloudPath = `shops/${safeName}/${Date.now()}-${index}.${ext}`;
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      });
      uploaded.push(res.fileID);
    }
    return uploaded;
  },

  async handleSubmit() {
    const name = (this.data.shopName || "").trim();
    const placeType = this.data.placeTypes[this.data.placeTypeIndex];
    const tags = this.data.selectedTags;
    const address = (this.data.addressInput || "").trim();
    const phone = (this.data.phone || "").trim();

    if (!name) {
      wx.showToast({ title: "请填写店铺名称", icon: "none" });
      return;
    }
    if (!tags.length) {
      wx.showToast({ title: "请至少选择一个标签", icon: "none" });
      return;
    }
    if (!address) {
      wx.showToast({ title: "请填写店铺地址", icon: "none" });
      return;
    }
    if (this.data.shopImages.length < 1) {
      wx.showToast({ title: "请上传1-3张店铺图片", icon: "none" });
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: "",
      successHint: this.data.mode === "edit" ? "正在保存店铺信息..." : "正在上传店铺图片...",
    });

    try {
      const imageFileIDs = await this.uploadShopImages(this.data.shopImages, name);
      const action = this.data.mode === "edit" ? "updateShop" : "createCustom";
      const result = await wx.cloud.callFunction({
        name: "shop",
        data: {
          action,
          shopId: this.data.shopId,
          name,
          placeType,
          tags,
          category: tags[0],
          address,
          phone,
          images: imageFileIDs,
          latitude: this.data.latitude,
          longitude: this.data.longitude,
        },
      });

      const payload = result.result || {};
      const shop = payload.shop;
      if (!shop) {
        throw new Error(this.data.mode === "edit" ? "店铺更新失败" : "店铺创建失败");
      }

      try {
        if (typeof this.getOpenerEventChannel === "function") {
          const eventChannel = this.getOpenerEventChannel();
          if (eventChannel && typeof eventChannel.emit === "function") {
            if (this.data.mode === "edit") {
              eventChannel.emit("shopUpdated", { shop });
            } else {
              eventChannel.emit("shopAdded", { shop });
            }
          }
        }
      } catch (eventError) {
        console.warn("[addShop] emit opener event failed:", eventError);
      }

      wx.showToast({
        title: this.data.mode === "edit" ? "店铺已更新" : "店铺创建成功",
        icon: "success",
      });
      setTimeout(() => wx.navigateBack(), 450);
    } catch (error) {
      const rawMessage = (error && (error.errMsg || error.message)) || "保存失败";
      let friendlyMessage = rawMessage;
      if (rawMessage.includes("不支持的 action: updateShop")) {
        friendlyMessage = "shop 云函数版本过旧，请重新上传并部署 cloudfunctions/shop";
      } else if (rawMessage.includes("无权限编辑店铺")) {
        friendlyMessage = "当前账号没有编辑权限，请先确认已配置为管理员";
      }
      console.error("[addShop] submit failed:", error);
      this.setData({
        errorMessage: (error && (error.errMsg || error.message)) || "保存失败，请稍后重试。",
      });
      this.setData({
        errorMessage: friendlyMessage,
      });
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({
        submitting: false,
        successHint: "",
      });
    }
  },
});
