// 统一返回结构 { code, msg, data }
exports.ok = (res, data = {}, msg = 'success') => res.json({ code: 200, msg, data });

exports.fail = (res, code = 500, msg = '服务异常', data = {}) =>
  res.status(code >= 400 && code < 600 ? code : 200).json({ code, msg, data });
