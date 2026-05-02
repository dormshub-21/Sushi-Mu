const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        message: 'Token no enviado'
      });
    }

    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Token inválido o expirado'
    });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      message: 'No tienes permisos de administrador'
    });
  }

  next();
}

module.exports = {
  authRequired,
  adminRequired
};
