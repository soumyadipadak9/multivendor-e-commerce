const mongoose = require('mongoose');

// product schema
const categorySchema = new mongoose.Schema({
    categoryName: {
        type: String,
        maxlength: 30,
        required: true,
        unique: true
        //   "description": "Name of the product."
    },

    parentCategory:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "category",
        default: null
    },

    // categoryImage: {
    //     type: String,
    //     // required: true
    // },
    // //   "description": "URL of product image."

    customAttributes: [{
         name: {
            type:String
         }
        }],
},
    {
        timestamps: true
    });

const category = new mongoose.model("category", categorySchema);

module.exports = category;