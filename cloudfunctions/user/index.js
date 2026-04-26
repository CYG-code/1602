const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

function normalizeProfile(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    openid: user.openid,
    nickName: user.nickName || "",
    avatarUrl: user.avatarUrl || "",
    role: user.role || "user",
    status: user.status || "active",
    checkinCount: Number(user.checkinCount || 0),
    favoriteShops: Array.isArray(user.favoriteShops) ? user.favoriteShops : [],
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

async function getUserRawByOpenid(openid) {
  const queryRes = await db.collection("users").where({ openid }).limit(1).get();
  return (queryRes.data || [])[0] || null;
}

async function getUserByOpenid(openid) {
  const user = await getUserRawByOpenid(openid);
  return normalizeProfile(user);
}

async function getSession() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const user = await getUserByOpenid(openid);
  return {
    openid,
    user,
  };
}

async function login(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const nickName = String(event.nickName || "").trim();
  const avatarUrl = String(event.avatarUrl || "").trim();
  if (!nickName) {
    throw new Error("nickName 不能为空");
  }

  const now = db.serverDate();
  const users = db.collection("users");
  const existing = await getUserRawByOpenid(openid);

  if (existing) {
    await users.doc(existing._id).update({
      data: {
        nickName,
        avatarUrl,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  } else {
    await users.add({
      data: {
        openid,
        nickName,
        avatarUrl,
        role: "user",
        status: "active",
        checkinCount: 0,
        favoriteShops: [],
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  const user = await getUserByOpenid(openid);
  return { openid, user };
}

async function updateProfile(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const nickName = String(event.nickName || "").trim();
  const avatarUrl = String(event.avatarUrl || "").trim();
  if (!nickName) {
    throw new Error("nickName 不能为空");
  }

  const users = db.collection("users");
  const existing = await getUserRawByOpenid(openid);
  const now = db.serverDate();

  if (existing) {
    await users.doc(existing._id).update({
      data: {
        nickName,
        avatarUrl,
        updatedAt: now,
      },
    });
  } else {
    await users.add({
      data: {
        openid,
        nickName,
        avatarUrl,
        role: "user",
        status: "active",
        checkinCount: 0,
        favoriteShops: [],
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  const user = await getUserByOpenid(openid);
  return { openid, user };
}

async function toggleFavorite(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const shopId = String(event.shopId || "").trim();
  if (!shopId) {
    throw new Error("shopId 不能为空");
  }

  const shopRes = await db.collection("shops").doc(shopId).get();
  if (!shopRes.data) {
    throw new Error("店铺不存在");
  }

  const userRaw = await getUserRawByOpenid(openid);
  if (!userRaw) {
    throw new Error("请先登录后再收藏");
  }

  const favoriteShops = Array.isArray(userRaw.favoriteShops) ? userRaw.favoriteShops : [];
  const exists = favoriteShops.includes(shopId);
  const nextFavorites = exists
    ? favoriteShops.filter((id) => id !== shopId)
    : [...favoriteShops, shopId];

  await db.collection("users").doc(userRaw._id).update({
    data: {
      favoriteShops: nextFavorites,
      updatedAt: db.serverDate(),
    },
  });

  return {
    shopId,
    favorited: !exists,
    favoriteShops: nextFavorites,
  };
}

async function getFavoriteStatus(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const shopId = String(event.shopId || "").trim();
  if (!shopId) {
    throw new Error("shopId 不能为空");
  }

  const userRaw = await getUserRawByOpenid(openid);
  const favoriteShops = Array.isArray(userRaw && userRaw.favoriteShops) ? userRaw.favoriteShops : [];
  return {
    shopId,
    favorited: favoriteShops.includes(shopId),
  };
}

async function getFavorites() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取 OPENID");
  }

  const userRaw = await getUserRawByOpenid(openid);
  const favoriteShops = Array.isArray(userRaw && userRaw.favoriteShops) ? userRaw.favoriteShops : [];
  if (!favoriteShops.length) {
    return {
      shops: [],
    };
  }

  const shopsRes = await db
    .collection("shops")
    .where({
      _id: _.in(favoriteShops),
    })
    .get();

  const shopMap = new Map((shopsRes.data || []).map((item) => [item._id, item]));
  const ordered = favoriteShops.map((id) => shopMap.get(id)).filter(Boolean);

  return {
    shops: ordered,
  };
}

exports.main = async (event) => {
  const action = event.action;

  switch (action) {
    case "getSession":
      return getSession();
    case "login":
      return login(event);
    case "updateProfile":
      return updateProfile(event);
    case "toggleFavorite":
      return toggleFavorite(event);
    case "getFavoriteStatus":
      return getFavoriteStatus(event);
    case "getFavorites":
      return getFavorites();
    default:
      throw new Error(`不支持的 action: ${action}`);
  }
};
