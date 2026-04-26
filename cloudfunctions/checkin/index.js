const cloud = require("wx-server-sdk");
const { adminOpenids = [] } = require("./config.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeImageList(value, max = 3) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function isAdmin(openid) {
  return !!openid && Array.isArray(adminOpenids) && adminOpenids.includes(openid);
}

async function getCurrentUser(openid) {
  const res = await db.collection("users").where({ openid }).limit(1).get();
  return (res.data || [])[0] || null;
}

async function appendPermissionState(openid, list) {
  const admin = isAdmin(openid);
  return list.map((item) => ({
    ...item,
    canDelete: admin || item.userId === openid,
    likeCount: Math.max(0, toNumber(item.likeCount, 0)),
  }));
}

async function appendLikedState(openid, list) {
  const withPermission = await appendPermissionState(openid, list);
  if (!openid || withPermission.length === 0) {
    return withPermission.map((item) => ({ ...item, liked: false }));
  }

  const checkinIds = withPermission.map((item) => item._id).filter(Boolean);
  if (!checkinIds.length) {
    return withPermission.map((item) => ({ ...item, liked: false }));
  }

  const likeRes = await db
    .collection("likes")
    .where({
      userId: openid,
      checkinId: _.in(checkinIds),
    })
    .get();

  const likedSet = new Set((likeRes.data || []).map((item) => item.checkinId));
  return withPermission.map((item) => ({
    ...item,
    liked: likedSet.has(item._id),
  }));
}

async function recalcShopStats(shopId) {
  const res = await db
    .collection("checkins")
    .where({ shopId })
    .field({
      rating: true,
      avgPrice: true,
    })
    .get();

  const list = res.data || [];
  const checkinCount = list.length;
  const ratingValues = list.map((item) => toNumber(item.rating, 0)).filter((item) => item > 0);
  const avgPriceValues = list.map((item) => toNumber(item.avgPrice, 0)).filter((item) => item > 0);

  const avgRating = ratingValues.length
    ? Number((ratingValues.reduce((acc, cur) => acc + cur, 0) / ratingValues.length).toFixed(1))
    : 0;

  const avgPrice = avgPriceValues.length
    ? Number((avgPriceValues.reduce((acc, cur) => acc + cur, 0) / avgPriceValues.length).toFixed(0))
    : 0;

  await db.collection("shops").doc(shopId).update({
    data: {
      checkinCount,
      avgRating,
      avgPrice,
      updatedAt: db.serverDate(),
    },
  });
}

async function createCheckin(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  const shopId = normalizeText(event.shopId);
  const shopNameFromEvent = normalizeText(event.shopName);
  const rating = clamp(toNumber(event.rating, 0), 0, 5);
  const avgPrice = clamp(toNumber(event.avgPrice, 0), 0, 100000);
  const content = normalizeText(event.content).slice(0, 500);
  const images = normalizeImageList(event.images, 3);
  const mealImages = normalizeImageList(event.mealImages, 3);
  const dishName = normalizeText(event.dishName).slice(0, 80);
  const recommend = typeof event.recommend === "boolean" ? event.recommend : null;

  if (!shopId) {
    throw new Error("shopId 不能为空");
  }
  if (recommend === null) {
    throw new Error("请先选择推荐或不推荐");
  }
  if (rating < 0 || rating > 5) {
    throw new Error("评分必须在 0 到 5 之间");
  }

  const shopRes = await db.collection("shops").doc(shopId).get();
  const shop = shopRes.data;
  if (!shop) {
    throw new Error("店铺不存在");
  }

  const user = await getCurrentUser(openid);
  const userInfo = {
    nickName: (user && user.nickName) || "微信用户",
    avatarUrl: (user && user.avatarUrl) || "",
  };

  const data = {
    shopId,
    shopName: shopNameFromEvent || shop.name || "未命名店铺",
    userId: openid,
    userInfo,
    images,
    mealImages,
    dishName,
    content,
    recommend,
    rating,
    avgPrice,
    likeCount: 0,
    commentCount: 0,
    createdAt: db.serverDate(),
  };

  const addRes = await db.collection("checkins").add({ data });
  await recalcShopStats(shopId);
  await db.collection("users").where({ openid }).update({
    data: {
      checkinCount: _.inc(1),
      updatedAt: db.serverDate(),
    },
  });

  const created = await db.collection("checkins").doc(addRes._id).get();
  return {
    checkin: created.data || { ...data, _id: addRes._id },
  };
}

async function removeCheckin(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  const checkinId = normalizeText(event.checkinId);
  if (!checkinId) {
    throw new Error("checkinId 不能为空");
  }

  const checkinRes = await db.collection("checkins").doc(checkinId).get();
  const checkin = checkinRes.data || null;
  if (!checkin) {
    throw new Error("打卡不存在或已删除");
  }

  const canDelete = checkin.userId === openid || isAdmin(openid);
  if (!canDelete) {
    throw new Error("无权限删除该打卡");
  }

  await Promise.all([
    db.collection("likes").where({ checkinId }).remove(),
    db.collection("comments").where({ checkinId }).remove(),
    db.collection("checkins").doc(checkinId).remove(),
  ]);

  if (checkin.shopId) {
    await recalcShopStats(checkin.shopId);
  }

  if (checkin.userId) {
    await db.collection("users").where({ openid: checkin.userId }).update({
      data: {
        checkinCount: _.inc(-1),
        updatedAt: db.serverDate(),
      },
    });
  }

  return {
    deleted: true,
    checkinId,
    shopId: checkin.shopId || "",
  };
}

async function getByShop(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  const shopId = normalizeText(event.shopId);
  const page = Math.max(1, toNumber(event.page, 1));
  const pageSize = clamp(toNumber(event.pageSize, 10), 1, 20);

  if (!shopId) {
    throw new Error("shopId 不能为空");
  }

  const skip = (page - 1) * pageSize;
  const res = await db
    .collection("checkins")
    .where({ shopId })
    .orderBy("createdAt", "desc")
    .skip(skip)
    .limit(pageSize)
    .get();

  const list = await appendLikedState(openid, res.data || []);
  return {
    list,
    page,
    pageSize,
    hasMore: list.length === pageSize,
    isAdmin: isAdmin(openid),
  };
}

async function getByUser(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  const page = Math.max(1, toNumber(event.page, 1));
  const pageSize = clamp(toNumber(event.pageSize, 10), 1, 20);
  const skip = (page - 1) * pageSize;

  const res = await db
    .collection("checkins")
    .where({ userId: openid })
    .orderBy("createdAt", "desc")
    .skip(skip)
    .limit(pageSize)
    .get();

  const list = await appendLikedState(openid, res.data || []);
  return {
    list,
    page,
    pageSize,
    hasMore: list.length === pageSize,
    isAdmin: isAdmin(openid),
  };
}

exports.main = async (event) => {
  const action = String(event.action || "");
  switch (action) {
    case "create":
      return createCheckin(event);
    case "delete":
      return removeCheckin(event);
    case "getByShop":
      return getByShop(event);
    case "getByUser":
      return getByUser(event);
    default:
      throw new Error(`不支持的 action: ${action}`);
  }
};
