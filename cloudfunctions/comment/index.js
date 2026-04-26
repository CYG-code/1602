const cloud = require("wx-server-sdk");
const { adminOpenids = [] } = require("./config.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isAdmin(openid) {
  return !!openid && Array.isArray(adminOpenids) && adminOpenids.includes(openid);
}

async function requireUser(openid) {
  const res = await db.collection("users").where({ openid }).limit(1).get();
  const user = (res.data || [])[0] || null;
  if (!user) {
    throw new Error("请先登录后再评论");
  }
  return user;
}

async function recalcCommentCount(checkinId) {
  const countRes = await db.collection("comments").where({ checkinId }).count();
  const commentCount = Math.max(0, toNumber(countRes.total, 0));
  await db.collection("checkins").doc(checkinId).update({
    data: { commentCount },
  });
  return commentCount;
}

async function createComment(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  const checkinId = normalizeText(event.checkinId);
  const content = normalizeText(event.content).slice(0, 300);
  const replyTo = event.replyTo && typeof event.replyTo === "object" ? event.replyTo : null;

  if (!checkinId) {
    throw new Error("checkinId 不能为空");
  }
  if (!content) {
    throw new Error("评论内容不能为空");
  }

  const checkinRes = await db.collection("checkins").doc(checkinId).get();
  const checkin = checkinRes.data || null;
  if (!checkin) {
    throw new Error("打卡不存在");
  }

  const user = await requireUser(openid);
  const userInfo = {
    nickName: user.nickName || "微信用户",
    avatarUrl: user.avatarUrl || "",
  };

  const data = {
    checkinId,
    userId: openid,
    userInfo,
    content,
    createdAt: db.serverDate(),
  };

  if (replyTo && replyTo.userId && replyTo.nickName) {
    data.replyTo = {
      userId: normalizeText(replyTo.userId),
      nickName: normalizeText(replyTo.nickName).slice(0, 60),
    };
  }

  const addRes = await db.collection("comments").add({ data });
  const commentCount = await recalcCommentCount(checkinId);
  const created = await db.collection("comments").doc(addRes._id).get();

  return {
    comment: created.data || { ...data, _id: addRes._id },
    commentCount,
  };
}

async function deleteComment(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  const commentId = normalizeText(event.commentId);
  if (!commentId) {
    throw new Error("commentId 不能为空");
  }

  const res = await db.collection("comments").doc(commentId).get();
  const comment = res.data || null;
  if (!comment) {
    throw new Error("评论不存在或已删除");
  }

  const canDelete = comment.userId === openid || isAdmin(openid);
  if (!canDelete) {
    throw new Error("无权限删除该评论");
  }

  await db.collection("comments").doc(commentId).remove();
  const commentCount = await recalcCommentCount(comment.checkinId);

  return {
    deleted: true,
    commentId,
    checkinId: comment.checkinId,
    commentCount,
  };
}

async function getByCheckin(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  const checkinId = normalizeText(event.checkinId);
  const page = Math.max(1, toNumber(event.page, 1));
  const pageSize = clamp(toNumber(event.pageSize, 20), 1, 50);

  if (!checkinId) {
    throw new Error("checkinId 不能为空");
  }

  const skip = (page - 1) * pageSize;
  const res = await db
    .collection("comments")
    .where({ checkinId })
    .orderBy("createdAt", "asc")
    .skip(skip)
    .limit(pageSize)
    .get();

  const admin = isAdmin(openid);
  const list = (res.data || []).map((item) => ({
    ...item,
    canDelete: admin || item.userId === openid,
  }));

  return {
    list,
    page,
    pageSize,
    hasMore: list.length === pageSize,
    isAdmin: admin,
  };
}

exports.main = async (event) => {
  const action = String(event.action || "");
  switch (action) {
    case "create":
      return createComment(event);
    case "delete":
      return deleteComment(event);
    case "getByCheckin":
      return getByCheckin(event);
    default:
      throw new Error(`不支持的 action: ${action}`);
  }
};
