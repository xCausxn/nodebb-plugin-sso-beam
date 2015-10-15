(function (module) {
	"use strict";

	var User = module.parent.require('./user'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		passportBeam = require('passport-beam').OAuth2Strategy,
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		async = module.parent.require('async');

	var constants = Object.freeze({
		'name': "Beam SSO",
		'admin': {
			'route': '/plugins/sso-beam',
			'icon': 'icon-beam'
		}
	});


	var Beam = {};

	Beam.init = function (data, callback) {
		function render(req, res, next) {
			res.render('admin/plugins/sso-beam', {});
		}

		data.router.get('/admin/plugins/sso-beam', data.middleware.admin.buildHeader, render);
		data.router.get('/api/admin/plugins/sso-beam', render);

		callback();
	};


	Beam.getStrategy = function (strategies, callback) {
		meta.settings.get('sso-beam', function(err, settings) {
			if (!err && settings['id'] && settings['secret']) {

				passport.use(new passportBeam({
					clientID: settings['id'],
					clientSecret: settings['secret'],
					callbackURL: nconf.get('url') + '/auth/beam/callback'
				}, function (accessToken, refreshToken, profile, done) {
					Beam.login(profile.id, profile.username, profile.email, function (err, user) {
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
					scope: settings['scope'] || 'channel:details:self'
				});
			}

			callback(null, strategies);
		});
	};


  Beam.login = function (beamid, handle, email, callback) {
    Beam.getUidByBeamId(beamid, function (err, uid) {
      if (err) {
        return callback(err);
      }

      if (uid !== null) {
        // Existing User
        callback(null, {
          uid: uid
        });
      } else {
        // New User
        var success = function (uid) {
          meta.settings.get('sso-beam', function (err, settings) {
            var autoConfirm = settings && settings['autoconfirm'] === "on" ? 1 : 0;
            User.setUserField(uid, 'email:confirmed', autoConfirm);
            User.setUserField(uid, 'beamid', beamid);
            db.setObjectField('beamid:uid', beamid, uid);

            callback(null, {
              uid: uid
            });

          });
        };

        User.getUidByEmail(email, function(err, uid) {
          if (err) {
            return callback(err);
          }

          if (!uid) {
            User.create({username: handle, email: email}, function (err, uid) {
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

  Beam.getUidByBeamId = function (beamid, callback) {
    db.getObjectField('beamid:uid', beamid, function(err, uid) {
      if (err) {
        return callback(err);
      }
      callback(null, uid);
    });
  };

  Beam.addMenuItem = function (custom_header, callback) {
    custom_header.authentication.push({
      "route": constants.admin.route,
      "icon": constants.admin.icon,
      "name": constants.name
    });

    callback(null, custom_header);
  };


  Beam.deleteUserData = function(uid, callback) {
    async.waterfall([
      async.apply(User.getUserField, uid, 'beamid'),
      function (oAuthIdToDelete, next) {
        db.deleteObjectField('beamid:uid', oAuthIdToDelete, next);
      }
    ], function(err) {
      if (err) {
        winston.error('[sso-beam] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
        return callback(err);
      }
      callback(null, uid);
    });
  };



	module.exports = Beam;
}(module));
