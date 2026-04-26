function formatTime(value) {
  if (!value) {
    return "";
  }
  let date;
  if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else if (value && typeof value === "object" && value.$date) {
    date = new Date(value.$date);
  } else {
    date = new Date();
  }

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

Component({
  properties: {
    checkin: {
      type: Object,
      value: null,
    },
    showShopName: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    createdAtText: "",
  },

  observers: {
    checkin(next) {
      const createdAt = next && next.createdAt;
      this.setData({
        createdAtText: formatTime(createdAt),
      });
    },
  },

  methods: {
    handlePreviewImage(event) {
      const current = event.currentTarget.dataset.url;
      const checkin = this.properties.checkin || {};
      const images = Array.isArray(checkin.images) ? checkin.images.filter(Boolean) : [];
      const mealImages = Array.isArray(checkin.mealImages) ? checkin.mealImages.filter(Boolean) : [];
      let urls = images;
      if (mealImages.includes(current)) {
        urls = mealImages;
      }
      if (!current || !urls.length) {
        return;
      }
      wx.previewImage({
        current,
        urls,
      });
    },

    handleLikeTap() {
      const checkin = this.properties.checkin || {};
      if (!checkin._id) {
        return;
      }
      this.triggerEvent("liketap", {
        checkinId: checkin._id,
      });
    },

    handleCommentTap() {
      const checkin = this.properties.checkin || {};
      if (!checkin._id) {
        return;
      }
      this.triggerEvent("commenttap", {
        checkinId: checkin._id,
      });
    },

    handleDeleteTap() {
      const checkin = this.properties.checkin || {};
      if (!checkin._id) {
        return;
      }
      this.triggerEvent("deletetap", {
        checkinId: checkin._id,
      });
    },
  },
});
