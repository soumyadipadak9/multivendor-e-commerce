const mongoose = require('mongoose');
const validator = require("validator");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// Schema
const addressSchema = new mongoose.Schema({
    street: {
        type: String,
        // required:true,
        default:null,
        maxlength: 30
    },
    city: {
        type: String,
        // required:true,
        default:null,
        maxlength: 20
    },
    state: {
        type: String,
        // required:true,
        default:null,
        maxlength: 20
    },
    zipcode: {
        type: Number,
        // required:true,
        default:null,
        min: 100000,
        max: 999999
    },
    fullAddr: {
        type: String,
        // required:true,
        default:null,
        maxlength: 150
    }
})

//pickupaddressSchema

const pickupaddressSchema = new mongoose.Schema({
    street: {
        type: String,
        // required:true,
        default:null,
        maxlength: 30
    },
    city: {
        type: String,
        // required:true,
        default:null,
        maxlength: 20
    },
    state: {
        type: String,
        // required:true,
        default:null,
        maxlength: 20
    },
    zipcode: {
        type: Number,
        // required:true,
        default:null,
        min: 100000,
        max: 999999
    },
    fullAddr: {
        type: String,
        // required:true,
        default:"",
        maxlength: 150
    }
})


const sellerSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        maxlength: 40
    },

    email: {
        type: String,
        required: true,
        maxlength: 40,
        unique: true,
        validate(value) {
            if (!validator.isEmail(value)) {
                throw new Error("Give a proper email");
            }
        }
    },

    password: {
        type: String,
        required: true,
        minlength: 5,
       // maxlength: 10
    },
    
    contactNo: {
        type: Number,
        // required:true,
        default:null,
        min: 1000000000,
        max: 9999999999
    },
    gstNo:{
        type: String,
        required:true,
        minlength:12,
        maxlength:15,
        unique:true,
        validate: {
            validator: value => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/.test(value),
            message: "Please provide a valid GST ID"
        }
    },
    panNo:{
        type: String,
        required:true,
        unique:true,
        minlength:10,
        maxlength:10,
        validate: {
            validator: value => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value),
            message: "Please provide a valid PAN card number"
        }
    },

    storeName:{
        type:String,
        maxlength:50,
        default:null
    },

    address: {
        type:addressSchema,
        default:{}
    },

    pickupAddress: {
        type:pickupaddressSchema,
        default:{}
    },

    active: {
        type: Boolean,
        default: true
    },

    status: {
        type: String,
        default: "incomplete"
    },


    tokens: [{
        token: {
            type: String,
            required: true
        }
    }]
},{
        timestamps:true
    });


// generating token

sellerSchema.methods.generateAuthToken = async function (req, res) {
    try {
        const tkn = await jwt.sign({ _id: this._id.toString() }, process.env.secretKey);
        this.tokens = this.tokens.concat({ token: tkn });
        console.log("created token is:  " + tkn);
        // await this.save();
        return tkn;
    } catch (error) {
        res.send("The error part is:   " + error);
        console.log("The error part is:   " + error);
    }
}


    // middleware for password hashing
sellerSchema.pre("save", async function (next) {
    if (this.isModified("password")) {
        console.log(`Password: ${this.password}`);
        this.password = await bcrypt.hash(this.password, 10);
        console.log(`Hashed Password: ${this.password}`);
    }
    next();
})

// creating collection

const Seller = new mongoose.model("Seller", sellerSchema);

module.exports = Seller;
