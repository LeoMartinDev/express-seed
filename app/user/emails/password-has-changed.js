'use strict';

/**
 * Dependencies
 */
let Locale = require('../../services/locale');
let mailer = require('../../services/mailer');
let config = require('../../config');

/**
 * Constants
 */
const EMAIL_IDENTITY_NOREPLY = config.EMAIL_IDENTITY_NOREPLY;

/**
 * Password changed helper
 */
module.exports = function passwordHasChanged(user) {

  //Set locale for translation
  let locale = new Locale(user.locale);

  //Create data for emails
  let data = {
    confirmation: locale.t('mail.passwordHasChanged.confirmation')
  };

  //Load
  return mailer.load('user/emails/password-has-changed', data)
    .spread((text, html) => ({
      to: user.email,
      from: EMAIL_IDENTITY_NOREPLY,
      subject: locale.t('mail.passwordHasChanged.subject'),
      text, html
    }));
};
