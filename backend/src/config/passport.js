const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Role = require('../models/Role'); // Import Role model

module.exports = function (passport) {
    // --- Google Strategy Setup ---
    const googleConfig = {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
    };

    passport.use(new GoogleStrategy(googleConfig,
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;
                const displayName = profile.displayName;
                const googleId = profile.id;

                if (!email) {
                    return done(new Error('Email not found in Google profile'), null);
                }

                // Find role 'user' (which serves as QA/Regular user)
                let qaRole = await Role.findOne({ where: { name: 'user' } });

                // Fallback (should not happen if seeded)
                if (!qaRole) {
                    console.error('❌ Default "user" role not found in database! Creating temporary fallback.');
                    qaRole = await Role.create({ name: 'user' });
                }

                let user = await User.findOne({ where: { email } });

                // Force QA role for ALL Google SSO users as per request
                const roleIdToAssign = qaRole.id;

                if (user) {
                    user.googleId = googleId;
                    user.displayName = displayName;
                    // Update role only if it's currently null or we want to enforce it every login
                    // User said: "make him to assign the role as the QA only"
                    // Doing this for existing users might downgrade admins, but strictly following instruction:
                    user.roleId = roleIdToAssign;

                    await user.save();
                    // Reload to ensure associations are fresh if needed
                    await user.reload({ include: [{ model: Role, as: 'UserRole' }] });
                } else {
                    user = await User.create({
                        googleId,
                        email,
                        displayName,
                        roleId: roleIdToAssign,
                        isActive: true
                    });
                    // Reload to populate UserRole for serialization
                    await user.reload({ include: [{ model: Role, as: 'UserRole' }] });
                }

                // Add role name to user object for Passport serialization if needed manually, 
                // though usually we fetch it in deserialize or generating token.
                // But our generateTokens service expects user.UserRole or user.role.

                return done(null, user);
            } catch (error) {
                console.error('Passport Google Strategy Error:', error);
                return done(error, null);
            }
        }));

    // Serialize/Deserialize
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id, {
                include: [{ model: Role, as: 'UserRole' }]
            });
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};
