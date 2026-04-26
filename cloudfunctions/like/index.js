const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

async function requireLoggedInUser(openid) {
  const userRes = await db.collection("users").where({ openid }).limit(1).get();
  const user = (userRes.data || [])[0] || null;
  if (!user) {
    throw new Error("请先登录后再点赞");
  }
  return user;
}

async function toggleLike(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("未获取到 openid");
  }

  await requireLoggedInUser(openid);

  const checkinId = String(event.checkinId || "").trim();
  if (!checkinId) {
    throw new Error("checkinId 不能为空");
  }

  const checkinRes = await db.collection("checkins").doc(checkinId).get();
  const checkin = checkinRes.data || null;
  if (!checkin) {
    throw new Error("打卡不存在");
  }

  const likes = db.collection("likes");
  const existingRes = await likes
    .where({
      checkinId,
      userId: openid,
    })
    .limit(1)
    .get();

  const existing = (existingRes.data || [])[0] || null;
  let liked = false;

  if (existing) {
    await likes.doc(existing._id).remove();
    await db.collection("checkins").doc(checkinId).update({
      data: {
        likeCount: _.inc(-1),
      },
    });
    liked = false;
  } else {
    await likes.add({
      data: {
        checkinId,
        userId: openid,
        createdAt: db.serverDate(),
      },
    });
    await db.collection("checkins").doc(checkinId).update({
      data: {
        likeCount: _.inc(1),
      },
    });
    liked = true;
  }

  const latestRes = await db.collection("checkins").doc(checkinId).get();
  const likeCount = Math.max(0, Number((latestRes.data && latestRes.data.likeCount) || 0));

  if ((latestRes.data && latestRes.data.likeCount) < 0) {
    await db.collection("checkins").doc(checkinId).update({
      data: {
        likeCount: 0,
      },
    });
  }

  return {
    checkinId,
    liked,
    likeCount,
  };
}

exports.main = async (event) => {
  const action = String(event.action || "");
  switch (action) {
    case "toggle":
      return toggleLike(event);
    default:
      throw new Error(`不支持的 action: ${action}`);
  }
};
