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

  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${m}-${d} ${hh}:${mm}`;
}

Component({
  properties: {
    comment: {
      type: Object,
      value: null,
    },
  },

  data: {
    createdAtText: "",
  },

  observers: {
    comment(next) {
      this.setData({
        createdAtText: formatTime(next && next.createdAt),
      });
    },
  },

  methods: {
    handleReplyTap() {
      const comment = this.properties.comment || {};
      const userInfo = comment.userInfo || {};
      this.triggerEvent("replytap", {
        userId: comment.userId || "",
        nickName: userInfo.nickName || "微信用户",
      });
    },

    handleDeleteTap() {
      const comment = this.properties.comment || {};
      if (!comment._id) {
        return;
      }
      this.triggerEvent("deletetap", {
        commentId: comment._id,
      });
    },
  },
});
