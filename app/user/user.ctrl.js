'use strict';

/**
 * External dependencies
 */
let chalk = require('chalk');

/**
 * Application dependencies
 */
let ValidationError = require('app/error/types/validationError');
let BadRequestError = require('app/error/types/badRequestError');
let NotFoundError = require('app/error/types/notFoundError');
let ServerError = require('app/error/types/serverError');
let token = require('app/shared/token');
let mailer = require('app/shared/mailer');
let config = require('app/config');
let User = require('app/user/user.model');

/**
 * Configuration
 */
const APP_BASE_URL = config.APP_BASE_URL;
const EMAIL_IDENTITY_NOREPLY = config.EMAIL_IDENTITY_NOREPLY;
const RESET_PASSWORD_TOKEN_EXPIRATION = config.RESET_PASSWORD_TOKEN_EXPIRATION;

/**
 * Generate verification email
 */
function sendVerificationEmail(req, res) {

  //Generate a mail verification token
  let token = token.generate('verifyEmail', {
    id: req.user.id
  });

  //Create data for i18n
  let data = {
    link: APP_BASE_URL + '/email/verify/' + token
  };

  //Create email (TODO: html email should be in a template)
  let email = {
    to: req.user.email,
    from: EMAIL_IDENTITY_NOREPLY,
    subject: res.__('user.verification.mail.subject'),
    text: res.__('user.verification.mail.text', data),
    html: res.__('user.verification.mail.html', data)
  };

  //Send mail
  return mailer.sendMail(email);
}

/**
 * User controller
 */
module.exports = {

  /**
   * Get data of authenticated user
   */
  me: function(req, res, next) {

    //Find user again, populating extra data
    User.findById(req.user._id).then(function(user) {
      if (!user) {
        return next(new BadRequestError());
      }
      res.json(user.toJSON());
    }, function(error) {
      next(error);
    });
  },

  /**
   * Create user
   */
  create: function(req, res, next) {

    //Get user data
    let data = req.body;

    //Create user
    User.create(data).then(function(user) {

      //Store in request
      req.user = user;

      //Send verification email (allow failure at this stage)
      sendVerificationEmail(req, res).catch(function(error) {
        console.warn(chalk.yellow('Email verification error:', error));
      });

      //Generate access token for immediate login
      user.accessToken = token.generate('access', user.toJSON());
      user.save().then(function(user) {

        //Convert to json
        let userJson = user.toJSON();

        //Manually append access token now to allow the user to login,
        //because the model deletes it from JSON form by default
        userJson.accessToken = user.accessToken;
        res.status(201).json(userJson);
      }, function(error) {
        next(error);
      });
    }, function(error) {
      next(new ValidationError(error));
    });
  },

  /**
   * Update user
   */
  update: function(req, res, next) {

    //Get user data and user
    let data = req.body;
    let user = req.user;

    //Update data
    let cantUpdate = ['roles', 'isSuspended', 'isEmailVerified'];
    for (let key in data) {
      if (data.hasOwnProperty(key) && cantUpdate.indexOf(key) === -1) {
        user[key] = data[key];
      }
    }

    //Save user
    user.save().then(function(user) {
      res.json(user.toJSON());
    }, function(error) {
      next(new ValidationError(error));
    });
  },

  /**
   * Exists check
   */
  exists: function(req, res, next) {
    User.find(req.body).limit(1).then(function(users) {
      res.json({exists: users.length > 0});
    }, function(error) {
      next(error);
    });
  },

  /**
   * Query users
   */
  query: function(req, res, next) {
    User.find({
      roles: 'user'
    }).then(function(users) {
      res.json(users);
    }, function(error) {
      next(error);
    });
  },

  /**
   * Send password reset mail
   */
  sendPasswordResetMail: function(req, res, next) {

    //If no user was found, send response anyway to prevent hackers from
    //figuring out which email addresses are valid and which aren't.
    if (!req.user) {
      return setTimeout(function() {
        res.end();
      }, 1000);
    }

    //Generate a password reset token
    let token = token.generate('resetPassword', {
      id: req.user.id
    });

    //Create data for i18n
    let data = {
      link: APP_BASE_URL + '/password/reset/' + token,
      validity: Math.floor(RESET_PASSWORD_TOKEN_EXPIRATION / 3600)
    };

    //Create email (TODO: html email should be in a template)
    let email = {
      to: req.user.email,
      from: EMAIL_IDENTITY_NOREPLY,
      subject: res.__('user.resetPassword.mail.subject'),
      text: res.__('user.resetPassword.mail.text', data),
      html: res.__('user.resetPassword.mail.html', data)
    };

    //Send mail
    mailer.sendMail(email).then(function() {
      res.end();
    }, function(error) {
      next(new ServerError(error));
    });
  },

  /**
   * Reset password
   */
  resetPassword: function(req, res, next) {

    //Get token from body
    let token = req.body.token;

    //Validate token
    token.validate('resetPassword', token).then(function(payload) {

      //No ID present?
      if (!payload.id) {
        return next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
      }

      //Find user
      User.findById(payload.id).then(function(user) {

        //No user?
        if (!user) {
          return next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
        }

        //Token already used?
        if (user.usedTokens && user.usedTokens.indexOf(token) >= 0) {
          return next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
        }

        //Update password, mark token as used
        user.password = req.body.password;
        user.usedTokens.push(token);

        //Save user
        user.save().then(function() {

          //Create email (TODO: html email should be in a template)
          let email = {
            to: user.email,
            from: EMAIL_IDENTITY_NOREPLY,
            subject: res.__('user.resetPasswordConfirm.mail.subject'),
            text: res.__('user.resetPasswordConfirm.mail.text'),
            html: res.__('user.resetPasswordConfirm.mail.html')
          };

          //Send confirmation mail (allow failure)
          mailer.sendMail(email);
          res.end();
        }, function(error) {
          next(new ValidationError(error));
        });
      });
    }, function() {
      return next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
    });
  },

  /**
   * Send verification email
   */
  sendVerificationEmail: function(req, res, next) {

    //Send mail
    sendVerificationEmail(req, res).then(function() {
      res.end();
    }, function(error) {
      next(new ServerError(error));
    });
  },

  /**
   * Verify sent email verification token
   */
  verifyEmail: function(req, res, next) {

    //Get token from body
    let token = req.body.token;

    //Validate token
    token.validate('verifyEmail', token).then(function(payload) {

      //No ID present?
      if (!payload.id) {
        return next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
      }

      //Find user and update
      User.findOneAndUpdate({
        _id: payload.id
      }, {
        isEmailVerified: true
      }).then(function() {
        res.json({
          isValid: true
        });
      }, function() {
        next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
      });
    }, function() {
      next(new ValidationError('INVALID_TOKEN', 'Invalid token'));
    });
  },

  /**
   * Find by email
   */
  findUserByEmail: function(req, res, next) {

    //No email?
    if (!req.body.email) {
      return next(new NotFoundError());
    }

    //Find by email
    User.findOne({
      email: req.body.email
    }).then(function(user) {

      //Not found?
      if (!user) {
        return next(new NotFoundError());
      }

      //Save in request and proceed to next middleware
      req.user = user;
      next();
    }, function(error) {
      next(error);
    });
  }
};
