const mongoose = require('mongoose');
const validator = require("validator");

// product schema
const productSchema = new mongoose.Schema({
   productName: {
      type: String,
      maxlength: 300,
      required: true
      //   "description": "Name of the product."
   },

   productDescription: {
      type: String,
      maxlength: 1000
      //   "description": "Description of the product."
   },

   productImage: {
      type: String,
      required: true
   },
   //   "description": "URL of product image."

   // productCategory: {
   //    type: mongoose.Schema.Types.ObjectId,
   //    ref:'category'
   //    //   "description": "Category or type of the product."
   // },

   productCategory: {
      type: String,
      maxlength: 30
   },

   sellerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller'
   },

   customAttributes: [{ name: String, value: String }],

   stock: {
      type: Number,
      max: 1000,
      min:0,
      required: true
      //   "description": "Current stock quantity of the product."
   },

   threshold: {
      type: Number,
      max: 1000,
      min:0,
      default:0,
      required: true
   },

   price: {
      type: Number,
      max: 10000000,
      required: true
      //   "description": "Price of the product."
   },

   discountPercentage: {
      type: Number,
      max: 100,
      required: true
   },

   discountedPrice: {
      type: Number,
      max: 10000000,
      required: true
   },

   status: {
      type: String,
      default: "Pending"
   },

   message: {
      type: String,
      maxlength: 100
   }
},
   {
      timestamps: true
   });

const product = new mongoose.model("product", productSchema);

module.exports = product;