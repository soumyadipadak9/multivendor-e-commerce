const mongoose = require('mongoose');
const validator = require("validator");

// schema
const shippingSchema = new mongoose.Schema({
   Name: {
      type: String,
      required: true,
      maxlength: 40
   },

   contactNo: {
      type: Number,
      required: true,
      min: 1000000000,
      max: 9999999999
      // "description": "Contact number for the customer associated with the order."
   },

   street: {
      type: String,
      // required:true,
      default: "",
      maxlength: 30
   },
   city: {
      type: String,
      // required:true,
      default: null,
      maxlength: 20
   },
   state: {
      type: String,
      required: true,
      // default: "",
      maxlength: 20
   },
   zipcode: {
      type: Number,
      required: true,
      // default: 100000,
      min: 100000,
      max: 999999
   },
   fullAddr: {
      type: String,
      required: true,
      // default: "",
      maxlength: 150
   }
})

const orderSchema = new mongoose.Schema({
   uID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      requird: true
   },

   orderDate: {
      type: Date,
      required: true
   },


   totalAmount: {
      type: Number,
      required: true,
      max: 100000000
      // "description": "Total amount (in the currency of your choice) for the order."
   },

   orderStatus: {
      type: String,
      required: true,
      maxlength: 40
      //    "description": "Status of the order, e.g., 'Pending,' 'Shipped,' 'Delivered,' etc."
   },

   products: [
      {
         pID: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'product'
            // "description": "A unique identifier for the product, e.g., SKU."
         },
         quantity: {
            type: Number,
            required: true
         },
         MRP: {
            type: Number,
            required: true
         },
         BuyingPrice: {
            type: Number,
            required: true
         },
         Total:{
            type: Number,
            required: true
         },
         processOrder: [{
            Status: {
               type: String,
               required: true,
               maxlength: 40
            },
            Date: {
               type: Date,
               required: true
            }
         }],

      }
   ],

   shippingDetails: {
      type: shippingSchema,
      // default: {},
      required: true

   },
},
   {
      timestamps: true
   });

// collection creation

const Order = new mongoose.model('Order', orderSchema);

module.exports = Order;