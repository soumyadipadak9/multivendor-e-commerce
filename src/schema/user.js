const mongoose = require('mongoose');
const validator = require("validator");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// Schema
const addressSchema = new mongoose.Schema({
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
        // required:true,
        default: "",
        maxlength: 20
    },
    zipcode: {
        type: Number,
        // required:true,
        default: 100000,
        min: 100000,
        max: 999999
    },
    fullAddr: {
        type: String,
        // required:true,
        default: "",
        maxlength: 150
    }
})


const userSchema = new mongoose.Schema({

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
        maxlength: 10
    },

    contactNo: {
        type: Number,
        // required:true,
        default: null,
        min: 1000000000,
        max: 9999999999
    },

    address: {
        type: addressSchema,
        default: {}
    },

    active: {
        type: Boolean,
        default: true
    },
    tokens: [{
        token: {
            type: String,
            required: true
        }
    }]
},
    {
        timestamps: true
    });



// generating token

userSchema.methods.generateAuthToken = async function (req, res) {
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
userSchema.pre("save", async function (next) {
    if (this.isModified("password")) {
        console.log(`Password: ${this.password}`);
        this.password = await bcrypt.hash(this.password, 10);
        console.log(`Hashed Password: ${this.password}`);
    }
    next();
})

// creating collection

const User = new mongoose.model("User", userSchema);

module.exports = User;
