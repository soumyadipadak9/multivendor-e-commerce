const jwt=require("jsonwebtoken");
const Seller=require("../schema/seller");

const auth_seller = async (req, res, next) => {
    try {
        const token = req.cookies.jwt_sellerlogin;

        if (token) {
            const verifySeller = jwt.verify(token, process.env.secretKey);
            const authenticatedSeller = await Seller.findOne({ _id: verifySeller._id });
            const sellerName = authenticatedSeller.name;

            req.token = token;
            req.authenticatedSeller = authenticatedSeller;
            req.sellerName = sellerName;
        }

        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        // An error occurred during token verification, but let the request proceed
        console.error(error);
        next();
    }
};

module.exports = auth_seller;