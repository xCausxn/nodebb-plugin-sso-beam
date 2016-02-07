(function (module) {
    "use strict";

    const User = module.parent.require('./user');
    const meta = module.parent.require('./meta');
    const db = module.parent.require('../src/database');
    const passport = module.parent.require('passport');
    const PassportBeam = require('passport-beam').OAuth2Strategy;
    const fs = module.parent.require('fs');
    const path = module.parent.require('path');
    const nconf = module.parent.require('nconf');
    const async = module.parent.require('async');

    const constants = {
        'name': "Beam SSO",
        'admin': {
            'route': '/plugins/sso-beam',
            'icon': 'icon-beam'
        }
    };


    const Beam = {};

    Beam.init = (data, callback) => {
        function render(req, res, next) {
            res.render('admin/plugins/sso-beam', {});
        }

        data.router.get('/admin/plugins/sso-beam', data.middleware.admin.buildHeader, render);
        data.router.get('/api/admin/plugins/sso-beam', render);

        callback();
    };


    Beam.getStrategy = (strategies, callback) => {
        meta.settings.get('sso-beam', (err, settings) => {
            if (!err && settings['id'] && settings['secret']) {

                passport.use(new PassportBeam({
                    clientID: settings['id'],
                    clientSecret: settings['secret'],
                    callbackURL: nconf.get('url') + '/auth/beam/callback'
                }, (accessToken, refreshToken, profile, done) => {
                    Beam.login(profile.id, profile.username, profile.email, profile._raw, (err, user) => {
                        if (err) {
                            return done(err);
                        }
                        done(null, user);
                    });
                }));

                strategies.push({
                    name: 'beam',
                    url: '/auth/beam',
                    callbackURL: '/auth/beam/callback',
                    icon: 'icon-beam',
                    scope: settings['scope'] || 'user:details:self'
                });
            }

            callback(null, strategies);
        });
    };

    Beam.forceAvatar = (uid, avatar) => {
        User.setUserFields(uid, {
            uploadedpicture: avatar.avatarUrl || 'https://beam.pro/_latest/img/app/avatars/default.jpg',
            picture: avatar.avatarUrl || 'https://beam.pro/_latest/img/app/avatars/default.jpg'
        });

    };

    Beam.login = (beamid, handle, email, avatar, callback) => {
        avatar = JSON.parse(avatar);
        Beam.getUidByBeamId(beamid, (err, uid) => {
            if (err) {
                return callback(err);
            }

            if (uid !== null) {
                // Existing User
                meta.settings.get('sso-beam', (err, settings) => {
                    var forceAvatar = settings && settings['forceAvatar'] === "on" ? 1 : 0;
                    if (forceAvatar) {
                        Beam.forceAvatar(uid, avatar);
                    }
                });
                callback(null, {
                    uid: uid
                });
            } else {
                // New User
                const success = (uid) => {
                    meta.settings.get('sso-beam', (err, settings) => {
                        const autoConfirm = (settings && settings['autoconfirm'] === "on") ? 1 : 0;
                        const forceAvatar = (settings && settings['forceAvatar'] === "on") ? 1 : 0;
                        if (forceAvatar) {
                            Beam.forceAvatar(uid, avatar);
                        }
                        User.setUserField(uid, 'email:confirmed', autoConfirm);
                        User.setUserField(uid, 'beamid', beamid);
                        db.setObjectField('beamid:uid', beamid, uid);

                        callback(null, {
                            uid: uid
                        });

                    });
                };

                User.getUidByEmail(email, (err, uid) => {
                    if (err) {
                        return callback(err);
                    }

                    if (!uid) {
                        User.create({ username: handle, email: email }, (err, uid) => {
                            if (err) {
                                return callback(err);
                            }
                            success(uid);
                        });
                    } else {
                        success(uid); // Existing account -- merge
                    }
                });
            }
        });
    };

    Beam.getUidByBeamId = (beamid, callback) => {
        db.getObjectField('beamid:uid', beamid, (err, uid) => {
            if (err) {
                return callback(err);
            }
            callback(null, uid);
        });
    };

    Beam.addMenuItem = (custom_header, callback) => {
        custom_header.authentication.push({
            "route": constants.admin.route,
            "icon": constants.admin.icon,
            "name": constants.name
        });

        callback(null, custom_header);
    };


    Beam.deleteUserData = (data, callback) => {
        const uid = data.uid;
        async.waterfall([
            async.apply(User.getUserField, uid, 'beamid'),
            (oAuthIdToDelete, next) => {
                db.deleteObjectField('beamid:uid', oAuthIdToDelete, next);
            }
        ], (err) => {
            if (err) {
                console.error(`[sso-beam] Could not remove OAuthId data for uid ${uid}. Error: ${err}`);
                return callback(err);
            }
            callback(null, uid);
        });
    };



    module.exports = Beam;
} (module));
