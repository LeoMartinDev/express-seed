'use strict';

/**
 * Dependencies
 */
const passport = require('passport');
const errors = require('meanie-express-error-handling');
const ExpiredTokenError = errors.ExpiredTokenError;
const InvalidTokenError = errors.InvalidTokenError;

/**
 * Authenticate
 */
module.exports = function authenticate(req, res, next) {

  //Authenticate now
  passport.authenticate('bearer', {
    session: false,
  }, (error, user, claims) => {

    //Ignore token errors, they will trigger 401's later if no user is present
    if (error instanceof ExpiredTokenError) {
      return next();
    }
    if (error instanceof InvalidTokenError) {
      return next();
    }

    //Propagate all other errors as we need to capture those
    if (error) {
      return next(error);
    }

    //Set claims in request if authenticated
    if (user) {
      req.claims = claims;
    }

    //Next middleware
    next();
  })(req, res, next);
};
