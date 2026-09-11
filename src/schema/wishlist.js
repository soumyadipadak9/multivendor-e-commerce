const mongoose = require('mongoose');
const validator = require("validator");
// schema

const wishlistSchema = new mongoose.Schema({
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        // "description": "Identifier for the user who owns the wishlist or added the product."
    },
    productID: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "product",
            default: null,
            // "description": "Identifier for the product added to the wishlist."
        },
    ]
});

// collection creation

const wishlist = new mongoose.model('wishlist', wishlistSchema);

module.exports = wishlist;