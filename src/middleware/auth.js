const jwt=require("jsonwebtoken");
const User=require("../schema/user");

const auth = async (req, res, next) => {
    try {
        const token = req.cookies.jwt_login;

        if (token) {
            const verifyUser = jwt.verify(token, process.env.secretKey);
            const authenticatedUser = await User.findOne({ _id: verifyUser._id });
            const userName = authenticatedUser.name;

            req.token = token;
            req.authenticatedUser = authenticatedUser;
            req.userName = userName;
        }

        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        // An error occurred during token verification, but let the request proceed
        console.error(error);
        next();
    }
};

module.exports = auth;