const mongoose = require('mongoose');
const validator = require("validator");
// schema

const cartSchema = new mongoose.Schema({
    
    userID: {
       type: mongoose.Schema.Types.ObjectId,
       required: true,
       ref: "User",
    //    "description": "Identifier for the user who owns the cart or added the product."
    },

   products: [
      {
         pID: {
            type: mongoose.Schema.Types.ObjectId,
            default:null,
            ref: 'product'
            // "description": "A unique identifier for the product, e.g., SKU."
         },
         quantity: {
            type: Number,
            default:1
         },

      }
   ]


});

// collection creation

const cart = new mongoose.model('cart', cartSchema);

module.exports = cart;