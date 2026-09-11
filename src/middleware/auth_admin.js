const jwt=require("jsonwebtoken");
const Admin=require("../schema/admin");

const auth_admin = async (req, res, next) => {
    try {
        const token = req.cookies.jwt_adminlogin;

        if (token) {
            const verifyAdmin = jwt.verify(token, process.env.secretKey);
            const authenticatedAdmin = await Admin.findOne({ _id: verifyAdmin._id });
            const adminName = authenticatedAdmin.name;

            req.token = token;
            req.authenticatedAdmin = authenticatedAdmin;
            req.adminName = adminName;
        }

        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        // An error occurred during token verification, but let the request proceed
        console.error(error);
        next();
    }
};

module.exports = auth_admin;