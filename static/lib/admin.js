define('admin/plugins/sso-beam', ['settings'], function (Settings) {
	'use strict';
	/* globals $, app, socket, require */

	var ACP = {};

	ACP.init = function () {
		Settings.load('sso-beam', $('.sso-beam-settings'));

		$('#save').on('click', function () {
			Settings.save('sso-beam', $('.sso-beam-settings'), function () {
				app.alert({
					type: 'success',
					alert_id: 'sso-beam-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function () {
						socket.emit('admin.reload');
					}
				});
			});
		});
	};

	return ACP;
});