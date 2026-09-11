const mongoose = require('mongoose');
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// Schema
const adminSchema = new mongoose.Schema({

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
    role:{
        type:String,
        default:"admin",
        required:true,
        minlength:2,
        maxlength:20

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

adminSchema.methods.generateAuthToken = async function (req, res) {
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
adminSchema.pre("save", async function (next) {
    if (this.isModified("password")) {
        console.log(`Password: ${this.password}`);
        this.password = await bcrypt.hash(this.password, 10);
        console.log(`Hashed Password: ${this.password}`);
    }
    next();
})

    // creating collection

const Admin = new mongoose.model("Admin", adminSchema);

module.exports = Admin;
