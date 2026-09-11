const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// connection creation
mongoose.connect(process.env.database_Name)
    .then(() => { console.log("Connection successfull...") })
    .catch((err) => { console.log(err) });