const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    UID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    PID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'product'
    },

    ratings: {
        type: Number,
        min: 1,
        max: 5
    },

    review: {
        type: String,
        minlength: 5,
        maxlength: 200
    }
},
    {
        timestamps: true
    });

const review = new mongoose.model('review', reviewSchema);

module.exports = review;