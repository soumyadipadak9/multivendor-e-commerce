require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const hbs = require("hbs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const auth = require("./middleware/auth");
const auth_admin = require("./middleware/auth_admin");
const auth_seller = require("./middleware/auth_seller");
const multer = require("multer");
const fs = require('fs');
const pdf = require('html-pdf');

const nodemailer = require("nodemailer");
const session = require('express-session');
const flash = require('express-flash');


const database = require("./mongodb");
const User = require("./schema/user");
const Admin = require("./schema/admin");
const Seller = require("./schema/seller");
const product = require("./schema/product");
const wishlist = require("./schema/wishlist");
const cart = require("./schema/cart");
const order = require("./schema/order");
const category = require("./schema/category");
const review = require("./schema/review");


const methodOverride = require('method-override');
const { read } = require("fs");
app.use(methodOverride('_method'));

//this line is also important even also for dynamic websites. It will load css files and images
const staticPath = path.join(__dirname, "../public");

const partialPath = path.join(__dirname, "../partials");

app.use(express.json());
app.use(cookieParser());
app.set("view engine", "hbs");
app.use(express.urlencoded({ extended: false }));

//this line is also important even also for dynamic websites. It will load css files and images
app.use(express.static(staticPath));

//to register partials
hbs.registerPartials(partialPath);



// for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // return cb(null,"./uploads");
        // return cb(null,"./public/uploads");
        return cb(null, "./public/image");
    },
    filename: function (req, file, cb) {
        return cb(null, `${Date.now()}-${file.originalname}`);
    }
})

// const upload=multer({dest:"uploads/"});

const upload = multer({ storage });



app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

app.use(flash());



let username = "";

app.get("/", auth, async (req, res) => {
    try {
        const items = await product.find();

        // get 5 random top products
        const suggested_items = await product.aggregate([
            {
                $match: { status: "Approved" } // Filter products by status
            },
            {
                $sample: { size: 5 } // Select a random sample of 5 items
            }
        ]);


        const top_rated_items = await product.aggregate([
            {
                $match: { status: "Approved" } // Add this $match stage to filter products by status
            },
            {
                $lookup: {
                    from: "reviews", // Assuming your reviews collection is named "reviews"
                    localField: "_id",
                    foreignField: "PID",
                    as: "reviews"
                }
            },
            {
                $addFields: {
                    averageRating: {
                        $avg: {
                            $ifNull: ["$reviews.ratings", 0] // Provide a default value of 0 if ratings array is null or missing
                        }
                    }
                }
            },
            {
                $sort: { averageRating: -1 }
            },
            {
                $limit: 5
            }
        ]);




        const most_discounts = await product.find({ status: "Approved" }).sort({ discountPercentage: -1 }).limit(5);

        const latest_products = await product.find({ status: "Approved" }).sort({ createdAt: -1 }).limit(5);

        // const distinctCategories = await product.aggregate([
        //     { $group: { _id: '$productCategory' } },
        //     { $project: { _id: 0, productCategory: '$_id' } }
        // ]);

        const distinctCategories = await category.find();
        // console.log(distinctCategories);

        if (req.authenticatedUser) {
            // User is authenticated
            const { username, active } = req.authenticatedUser;

            if (active) {
                res.render("home", {
                    nam: username,
                    _log: "<li><a href='/logout'>Log out</a></li>",
                    items,
                    suggested_items,
                    top_rated_items,
                    most_discounts,
                    latest_products,
                    distinctCategories,
                    EditProfile: "<li><a href='/EditProfile'>Edit Profile</a></li>",
                    wishlist: "<li><a href='/wishlist'>Wishlist</a></li>"
                });
            } else {
                res.send("Page not found.");
            }
        } else {
            // User is not authenticated
            res.render("home", {
                _log: "<li><a href='/login'>Log in</a></li>",
                nam: "Guest",
                items,
                suggested_items,
                top_rated_items,
                most_discounts,
                latest_products,
                distinctCategories
            });
        }
    } catch (e) {
        console.log(e);
        res.send("Error occurred.");
    }
});


app.get("/login", (req, res) => {
    res.render("login", { success_messages: req.flash('success') });
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/secret", auth, (req, res) => {
    console.log(`Login token get    :   ${req.cookies.jwt_login}`);
    res.render("secret", {
        nam3: req.userName
    });
});

app.get("/logout", auth, async (req, res) => {
    // console.log(`Login token get    :   ${req.cookies.jwt_login}`);
    try {
        console.log(`Authenticated user is:      ${req.authenticatedUser}`);
        res.clearCookie("jwt_login");
        // await req.authenticatedUser.save();
        res.redirect("login");
    } catch (error) {
        res.status(500).send(error);
    }
});


app.get("/search", async (req, res) => {
    // console.log(req.query.search);

    const distinctCategories = await category.find();

    const categoryProducts = await product.find({
        $and: [{ status: "Approved" },
        {
            $or: [
                { productCategory: { $regex: new RegExp(req.query.search), $options: 'i' } },
                { productName: { $regex: new RegExp(req.query.search), $options: 'i' } },
                { productDescription: { $regex: new RegExp(req.query.search), $options: 'i' } }
            ]
        }
        ]
    }).sort({ createdAt: -1 });

    res.render("search", {
        distinctCategories,
        categoryProducts,
        searchKeywords: req.query.search
    })
});


app.get("/wishlist", auth, async (req, res) => {
    try {
        const wishlistDoc = await wishlist.findOne({ userID: req.authenticatedUser._id });
        const productIDs = wishlistDoc.productID;

        const reversedProductIDs = productIDs.reverse();

        // Fetch full product documents based on productIDs in the specified order
        const wishlistProducts = await product.find({ _id: { $in: reversedProductIDs } });

        // Create a map to store the products based on their _id
        const productMap = new Map();
        wishlistProducts.forEach(product => {
            productMap.set(product._id.toString(), product);
        });

        // Map the productIDs array to their corresponding product documents
        const orderedWishlistProducts = productIDs.map(productId => productMap.get(productId.toString()));

        const distinctCategories = await category.find();

        res.render("wishlist", {
            orderedWishlistProducts,
            distinctCategories
        })
        // console.log(wishlistProducts)
    } catch (error) {
        res.send(error);
    }
})



app.get("/cart", auth, async (req, res) => {
    try {
        // res.send("Cart")
        const cartDoc = await cart.findOne({ userID: req.authenticatedUser._id });
        const products = cartDoc.products;

        const reversedProducts = products.reverse();
        // res.send(reversedProducts)

        var pr = []
        reversedProducts.forEach((items) => {
            pr.push(items.pID);
        })
        console.log(pr);

        for (let i = 0; i < pr.length; i++) {
            console.log(pr[i])
            const product_det = await product.findOne({ _id: pr[i] });
            if (product_det.stock == 0) {
                console.log(product_det)
                const Delete_items = await cart.updateOne({ $and: [{ userID: req.authenticatedUser._id }, { 'products.pID': product_det._id }] }, { $pull: { products: { pID: product_det._id } } });

                // pr.pull(product_det._id);

                // console.log(Delete_items)
            }
        }


        const cartDoc1 = await cart.findOne({ userID: req.authenticatedUser._id });
        const products1 = cartDoc1.products;

        const reversedProducts1 = products1.reverse();
        // res.send(reversedProducts)

        var pr1 = []
        reversedProducts1.forEach((items) => {
            pr1.push(items.pID);
        })


        // Fetch full product documents based on productIDs in the specified order
        const cartProducts = await product.find({ _id: { $in: pr1 } });
        // res.send(cartProducts)

        res.render("cart", {
            cartProducts
        })
        // console.log(wishlistProducts)
    } catch (error) {
        // res.send(error);
        res.send("You are not authorized to access this page. Do login to access this page.")
    }
})


app.post("/signup", async (req, res) => {
    try {
        const data = new User({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password
        });

        // call token
        const token = await data.generateAuthToken();
        console.log("The token part:    " + token);

        // store token in cookie
        // res.cookie(name,value,{options})
        res.cookie("jwt_signup", token, {
            expires: new Date(Date.now() + 20000),
            httpOnly: true
        });

        if (req.body.password == req.body.confirm_password) {
            const registered = await data.save();

            req.flash('success', 'Registered successfully!');
            // console.log(registered);
            // console.log(registered._id);

            const wishlist_data = new wishlist({
                userID: registered._id, // Use the _id of the registered user
                productID: [] //add products to the wishlist if needed
            });
            const cart_data = new cart({
                userID: registered._id, // Use the _id of the registered user
            })

            await wishlist_data.save();
            await cart_data.save();

            res.redirect("login");
        }
        else {
            res.render("signup", {
                err: "Password and Confirm Password should be equal"
            });
        }
    }
    catch (e) {
        // res.send("Form validation error");
        res.render("signup", {
            err: "Enter correct details"
        });
        console.log("error is: " + e)
    }
});


app.post("/login", async (req, res) => {
    try {
        const check = await User.findOne({ email: req.body.email });
        // compare hashed password and enter password
        const isMatch = await bcrypt.compare(req.body.password, check.password);
        console.log(`Compare hashed password and enter password: ${isMatch}`);

        const token = await check.generateAuthToken();
        console.log("The token part:    " + token);
        // const isMatch=true
        if (isMatch && check.active == true) {
            username = check.name;
            // store token in cookie
            // res.cookie(name,value,{options})
            res.cookie("jwt_login", token, {
                // expires: new Date(Date.now() + 20000),
                httpOnly: true
            });

            res.redirect("/");
            console.log("this is home");
        }
        else if(isMatch && check.active==false){
            res.render("login", {
                // err: "Wrong password"
                err: "Temporarily banned"
            });
        }
        else {
            // res.send("Wrong password");
            res.render("login", {
                // err: "Wrong password"
                err: "Wrong details"
            });
        }
    }
    catch (e) {
        // res.send("Wrong details");
        res.render("login", {
            err: "Wrong details"
        });
        console.log(e);
    }
});


app.get("/EditProfile", auth, async (req, res) => {
    try {
        // Access the _id of the authenticated user from the req object
        const UserUpdate = req.authenticatedUser;

        // const distinctCategories = await product.aggregate([
        //     { $group: { _id: '$productCategory' } },
        //     { $project: { _id: 0, productCategory: '$_id' } }
        // ]);

        const distinctCategories = await category.find();

        console.log(UserUpdate);
        // res.send("Success")
        res.render("EditProfile", {
            name: UserUpdate.name,
            email: UserUpdate.email,
            contactNo: UserUpdate.contactNo,
            street: UserUpdate.address.street,
            city: UserUpdate.address.city,
            state: UserUpdate.address.state,
            zipcode: UserUpdate.address.zipcode,
            fullAddr: UserUpdate.address.fullAddr,
            distinctCategories
        });

    } catch (e) {
        res.status(404).send("the error " + e);
    }
});


app.put("/EditProfile", auth, async (req, res) => {
    try {
        const User_id = req.authenticatedUser._id;
        // const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);
        const update = {
            name: req.body.name,
            email: req.body.email,
            contactNo: req.body.contactNo,
            address: {
                street: req.body.street,
                city: req.body.city,
                state: req.body.state,
                zipcode: req.body.zipcode,
                fullAddr: req.body.fullAddr
            }
        };

        const UpdatedUser = await User.findByIdAndUpdate({ _id: User_id }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/");
        // res.send("Product updated successfully");
    } catch (e) {
        res.status(404).send("Siiiuuuuu:    " + e);
    }
});


app.get("/category/:x", async (req, res) => {
    const categoryName = req.params.x;

    try {
        // Define a recursive function to fetch products of a category and its subcategories
        const getAllProductsRecursive = async (categoryId) => {
            const getCategory = await category.findOne({ _id: categoryId });
            // Find all categories that have the given categoryId as their parentCategory
            const subCategories = await category.find({ parentCategory: categoryId });
            // console.log(subCategories);
            console.log(getCategory.categoryName);

            // Get products of the current category
            // const categoryProducts = await product.find({ productCategory: getCategory.categoryName });

            const categoryProducts = await product.find({ $and: [{ status: "Approved" }, { productCategory: getCategory.categoryName }] });

            // console.log(categoryProducts);

            let allProducts = categoryProducts;

            // Recursively fetch products of subcategories
            for (const subCategory of subCategories) {
                const subCategoryProducts = await getAllProductsRecursive(subCategory._id);
                allProducts = allProducts.concat(subCategoryProducts);
            }

            return allProducts;
        };

        // Find the requested category by its name to get its ObjectId
        const requestedCategory = await category.findOne({ categoryName });
        console.log(requestedCategory);
        if (!requestedCategory) {
            return res.status(404).send("Category not found");
        }

        // Fetch distinct categories for display purposes
        // const distinctCategories = await product.aggregate([
        //     { $group: { _id: '$productCategory' } },
        //     { $project: { _id: 0, productCategory: '$_id' } }
        // ]);

        const distinctCategories = await category.find();

        // Fetch all products of the specified category and its subcategories
        const categoryProducts = await getAllProductsRecursive(requestedCategory._id);

        // Render the category product page
        res.render("categoryProduct", {
            categoryName,
            categoryProducts,
            distinctCategories
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Internal server error");
    }
});


app.get("/products/:x", auth, async (req, res) => {
    try {
        const distinctCategories = await category.find();

        const a = req.params.x;
        // console.log(req.params);
        // res.send(req.params);
        const getIndividualProduct = await product.findOne({ $and: [{ status: "Approved" }, { _id: a }] });

        const product_ratings = await review.find({ PID: getIndividualProduct._id }).populate('UID');
        console.log(product_ratings);
        var total_ratings = 0;
        var product_ratings_length = product_ratings.length;
        for (let i = 0; i < product_ratings_length; i++) {
            total_ratings += product_ratings[i].ratings;
        }
        if (product_ratings_length == 0) {
            var average_ratings = 0;
        }
        else {
            var average_ratings = ((total_ratings) / (product_ratings_length));
            average_ratings = average_ratings.toFixed(1);
        }
        console.log(average_ratings);

        if (getIndividualProduct.stock < 1) {
            var stock_status = 'Out of stock';
        }
        else {
            var stock_status = 'In stock';
        }


        const SimilarProducts = await product.aggregate([
            // Match products in the same category and exclude the current product
            { $match: { productCategory: getIndividualProduct.productCategory, status: "Approved", _id: { $ne: getIndividualProduct._id } } },
            // Calculate the absolute difference in discounted prices
            {
                $addFields: {
                    priceDifference: { $abs: { $subtract: ["$discountedPrice", getIndividualProduct.discountedPrice] } }
                }
            },
            // Sort products by the absolute difference in discounted prices in ascending order
            { $sort: { priceDifference: 1 } },
            // Limit to 4 similar products
            { $limit: 4 }
        ]);


        const features = getIndividualProduct.customAttributes;

        // console.log(getIndividualProduct);

        if (req.authenticatedUser) {
            // Check if a is already in productID
            const wishlistDoc = await wishlist.findOne({ userID: req.authenticatedUser._id });
            if (!wishlistDoc.productID.includes(a)) {
                var wishlist_button = `<button class="wishlistButton"><form class="wishlistForm" action="/add_wishlist/${a}?_method=PUT" method="POST">
                <input type="submit" value="Add to wishlist">
            </form></button>`
            }
            else {
                var wishlist_button = `<button class="wishlistButton"><form class="wishlistForm" action="/wishlist" method="GET">
                <input type="submit" value="Go to wishlist">
            </form></button>`
            }

            const cartDoc = await cart.findOne({ userID: req.authenticatedUser._id });
            if (!cartDoc.products.some(product => product.pID.equals(a))) {
                var cart_button = `<button class="wishlistButton"><form class="wishlistForm" action="/add_cart/${a}?_method=PUT" method="POST">
                <input type="submit" value="Add to cart">
            </form></button>`
            }
            else {
                var cart_button = `<button class="wishlistButton"><form class="wishlistForm" action="/cart" method="GET">
                <input type="submit" value="Go to cart">
            </form></button>`
            }

            res.render("product_details", {
                _id: getIndividualProduct._id,
                productImage: getIndividualProduct.productImage,
                productName: getIndividualProduct.productName,
                productDescription: getIndividualProduct.productDescription,
                price: getIndividualProduct.price,
                discountPercentage: getIndividualProduct.discountPercentage,
                discountedPrice: getIndividualProduct.discountedPrice,
                SimilarProducts,
                distinctCategories,
                features,
                wishlist_btn: wishlist_button,
                cart_button,
                stock_status: stock_status,
                product_ratings_length,
                average_ratings,
                product_ratings
            }
            );
        }
        else {
            res.render("product_details", {
                _id: getIndividualProduct._id,
                productImage: getIndividualProduct.productImage,
                productName: getIndividualProduct.productName,
                productDescription: getIndividualProduct.productDescription,
                // productCategory:getIndividualProduct.productCategory,
                // stock:getIndividualProduct.stock,
                price: getIndividualProduct.price,
                discountPercentage: getIndividualProduct.discountPercentage,
                discountedPrice: getIndividualProduct.discountedPrice,

                SimilarProducts,
                distinctCategories,
                features,
                stock_status: stock_status,
                product_ratings_length,
                average_ratings,
                product_ratings
            }
            );
        }
    }
    catch (e) {
        // res.status(404).send(e);
        res.status(404).send("Error 404");
    }
});


app.post("/products", upload.single("image_link"), async (req, res) => {
    try {
        // console.log(req.body);

        let full_image_link = req.file.path;
        let cut_image_link = full_image_link.slice(6);
        // console.log(cut_image_link);

        const { productName, productDescription, productCategory, customAttributes, stock, price, discountPercentage, discountedPrice } = req.body;

        const pdata = new product({
            productName,
            productDescription,
            productImage: cut_image_link,
            productCategory,
            customAttributes,
            stock,
            price,
            discountPercentage,
            discountedPrice
        })

        console.log(req.body)

        await pdata.save();

        res.redirect("admin");
    }
    catch (e) {
        // res.send("Form validation error");
        res.render("admin", {
            nam2: username,
            err: "Enter products"
        });
        console.log(e)
    }
})

app.get("/admin/admin_product_list", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "Product Manager")) {
            // const items = await product.find();

            const items = await product.find({ status: "Approved" }).populate('sellerID').sort({ createdAt: -1 });
            // console.log(items);

            res.render("admin/admin_product_list", { items });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
})


// app.delete("/product_delete/:x", async (req, res) => {
//     try {
//         const a = req.params.x;

//         const delete_items = await product.findOne({ _id: a });
//         const delete_items_image = delete_items.productImage;

//         // Instead of using confirm() on the server, simply proceed with deletion
//         const DeleteProduct = await product.deleteOne({ _id: a });

//         const RemoveFromAllWishlist = await wishlist.updateMany(
//             { productID: a },
//             { $pull: { productID: a } }
//         );

//         if (DeleteProduct.deletedCount === 1) {
//             // Product was successfully deleted
//             console.log("Product deleted:", DeleteProduct);

//             fs.unlink(`\public${delete_items_image}`, (err) => {
//                 console.log(err);
//             });
//             console.log(delete_items_image);
//             // res.redirect("seller/seller_product_list");
//             res.sendStatus(200); // Send a success status code
//         } else {
//             // Product not found or not deleted
//             console.error("Product not found or not deleted:", DeleteProduct);
//             res.sendStatus(404); // Send a not found status code
//         }
//     } catch (error) {
//         console.error("Error:", error);
//         res.status(500).send("Internal Server Error");
//     }
// });



app.delete("/product_delete/:x", async (req, res) => {
    try {
        const a = req.params.x;

        const delete_items = await product.findOne({ _id: a });
        const delete_items_image = delete_items.productImage;

        if (delete_items.status == "Approved") {

            // Instead of using confirm() on the server, simply proceed with deletion
            // const DeleteProduct = await product.deleteOne({ _id: a });
            const DeleteProduct = await product.updateOne({ _id: a }, { status: "Deleted" });

            // console.log(DeleteProduct);


            const RemoveFromAllWishlist = await wishlist.updateMany(
                { productID: a },
                { $pull: { productID: a } }
            );

            if (DeleteProduct.modifiedCount === 1) {
                // Product was successfully deleted
                console.log("Product deleted:", DeleteProduct);

                // fs.unlink(`\public${delete_items_image}`, (err) => {
                //     console.log(err);
                // });
                console.log(delete_items_image);
                // res.redirect("seller/seller_product_list");
                res.sendStatus(200); // Send a success status code
            } else {
                // Product not found or not deleted
                console.error("Product not found or not deleted:", DeleteProduct);
                res.sendStatus(404); // Send a not found status code
            }
        }

        else if (delete_items.status == "Pending" || delete_items.status == "Rejected") {
            // Instead of using confirm() on the server, simply proceed with deletion
            const DeleteProduct = await product.deleteOne({ _id: a });

            const RemoveFromAllWishlist = await wishlist.updateMany(
                { productID: a },
                { $pull: { productID: a } }
            );

            if (DeleteProduct.deletedCount === 1) {
                // Product was successfully deleted
                console.log("Product deleted:", DeleteProduct);

                fs.unlink(`\public${delete_items_image}`, (err) => {
                    console.log(err);
                });
                console.log(delete_items_image);
                // res.redirect("seller/seller_product_list");
                res.sendStatus(200); // Send a success status code
            } else {
                // Product not found or not deleted
                console.error("Product not found or not deleted:", DeleteProduct);
                res.sendStatus(404); // Send a not found status code
            }
        }


    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.put("/add_wishlist/:x", auth, async (req, res) => {
    try {
        const a = req.params.x;
        console.log(a);
        console.log(req.authenticatedUser._id)

        // Check if a is already in productID
        const wishlistDoc = await wishlist.findOne({ userID: req.authenticatedUser._id });
        if (!wishlistDoc.productID.includes(a)) {
            const AddToWishlist = await wishlist.findOneAndUpdate(
                { userID: req.authenticatedUser._id },
                { $push: { productID: a } },
                { new: true, upsert: true } // Use upsert to create the document if it doesn't exist
            );
            // res.status(200).send(AddToWishlist);
            res.redirect(`/products/${a}`);
        }
        else {
            // Value is already in the array, throw an error
            throw new Error(`Product ${a} is already in the wishlist.`);
        }
    } catch (error) {
        res.send(error);
    }
})


app.put("/remove_wishlist/:x", auth, async (req, res) => {
    try {
        const a = req.params.x;
        console.log(a);
        console.log(req.authenticatedUser._id)

        const RemoveFromWishlist = await wishlist.findOneAndUpdate(
            { userID: req.authenticatedUser._id },
            { $pull: { productID: a } },
            { new: true }
        );
        // res.status(200).send(RemoveFromWishlist);
        res.redirect("/wishlist");
    } catch (error) {
        res.send(error);
    }
})



app.put("/add_cart/:productId", auth, async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.authenticatedUser._id;

        // Check if the user already has a cart
        let cart_details = await cart.findOne({ userID: userId });

        let pr_dtls = await product.findOne({ _id: req.params.productId })
        // console.log(pr_dtls)

        // If user doesn't have a cart, create one
        if (!cart) {
            cart_details = await cart.create({ userID: userId, products: [] });
        }

        // Check if the product is already in the cart
        const productIndex = cart_details.products.findIndex(product => product.pID.equals(productId));

        if (productIndex === -1) {
            if (pr_dtls.stock > 0) {
                // If the product is not in the cart, add it
                cart_details.products.push({ pID: productId });
            }
        } else {
            // If the product is already in the cart, increase its quantity
            cart_details.products[productIndex].quantity += 1;
        }

        // Save the updated cart
        await cart_details.save();

        res.redirect(`/cart`);
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.put("/cart_product_delete/:x", auth, async (req, res) => {
    try {
        const a = req.params.x;
        console.log(a);
        const user = req.authenticatedUser._id;

        const Delete_items = await cart.updateOne({ $and: [{ userID: user }, { 'products.pID': a }] }, { $pull: { products: { pID: a } } });

        res.sendStatus(200);

    } catch (error) {
        res.status(500).send("Internal Server Error");
    }
});



let orderdetails = {};

// Admin Signup POST request
// app.post("/adminSignup", async (req, res) => {
//     try {
//         const data = new Admin({
//             name: req.body.name,
//             email: req.body.email,
//             password: req.body.password
//         });

//         // call token
//         const token = await data.generateAuthToken();
//         console.log("The token part:    " + token);

//         // store token in cookie
//         // res.cookie(name,value,{options})
//         res.cookie("jwt_admin", token, {
//             expires: new Date(Date.now() + 20000),
//             httpOnly: true
//         });

//         if (req.body.password == req.body.confirm_password) {
//             const registered = await data.save();
//             // console.log(registered);
//             // console.log(registered._id);
//             res.redirect("adminLogin");
//         }
//         else {
//             res.render("adminSignup", {
//                 err: "Password and Confirm Password should be equal"
//             });
//         }
//     }
//     catch (e) {
//         // res.send("Form validation error");
//         res.render("adminSignup", {
//             err: "Enter correct details"
//         });
//         console.log("error is: " + e)
//     }
// });


// Admin login POST request
app.post("/adminLogin", async (req, res) => {
    try {
        const check = await Admin.findOne({ email: req.body.email });
        // compare hashed password and enter password
        const isMatch = await bcrypt.compare(req.body.password, check.password);
        console.log(`Compare hashed password and enter password: ${isMatch}`);

        const token = await check.generateAuthToken();
        console.log("The token part:    " + token);


        if (isMatch) {
            // Adminname = check.name;
            // store token in cookie
            // res.cookie(name,value,{options})
            res.cookie("jwt_adminlogin", token, {
                //    expires: new Date(Date.now() + 20000),
                httpOnly: true
            });

            res.redirect("/admin_home");
            console.log("this is home");
        }
        else {
            // res.send("Wrong password");
            res.render("adminLogin", {
                // err: "Wrong password"
                err: "Wrong details"
            });
        }
    }
    catch (e) {
        // res.send("Wrong details");
        res.render("adminLogin", {
            err: "Wrong details"
        });
        console.log(e);
    }
});



// Admin logout
app.get("/adminLogout", auth_admin, async (req, res) => {
    // console.log(`Login token get    :   ${req.cookies.jwt_login}`);
    try {
        console.log(`Authenticated admin is:      ${req.authenticatedAdmin}`);
        res.clearCookie("jwt_adminlogin");
        console.log("logout successfully")

        // await req.authenticatedAdmin.save();
        res.redirect("adminLogin");
    } catch (error) {
        res.status(500).send(error);
    }
});


// app.get("/adminSignup", (req, res) => {
//     res.render("adminSignup");
// });


app.get("/adminLogin", (req, res) => {
    res.render("adminLogin");
});


app.get("/admin_home", auth_admin, async (req, res) => {
    try {
        console.log(req.authenticatedAdmin);
        if (req.authenticatedAdmin) {
            if (req.authenticatedAdmin.role == "admin") {
                const check = await Admin.findOne({ _id: req.authenticatedAdmin._id });

                const approved_product = await product.find({ status: "Approved" });
                const approve_product_length = approved_product.length;

                const total_customer = await User.find();
                const total_customer_length = total_customer.length;

                const total_seller = await Seller.find();
                const total_seller_length = total_seller.length;

                const total_employee = await Admin.find({ role: { $ne: "admin" } });
                const total_employee_length = total_employee.length;


                res.render("admin_home", {
                    check,
                    approve_product_length,
                    total_customer_length,
                    total_seller_length,
                    total_employee_length
                })
            }
            else if (req.authenticatedAdmin.role == "Product Manager") {
                res.redirect("/pending_products");
            }
            else if (req.authenticatedAdmin.role == "User Manager") {
                res.redirect("/user_list");
            }
            else {
                res.send("page not found");
            }
        }
        else {
            res.send("page not found");
        }
    } catch (error) {
        res.send(error)
    }
})


app.get("/employee", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && req.authenticatedAdmin.role == 'admin') {
            const emp = await Admin.find();
            res.render("employee", { emp });
        }
        else {
            res.send("employee page is not found");
        }
    } catch (error) {
        res.send(error);
    }
})


app.post("/employee", auth_admin, async (req, res) => {
    try {
        const data = new Admin({
            name: req.body.name,
            email: req.body.email,
            role: req.body.role,
            password: req.body.password
        });

        // call token
        const token = await data.generateAuthToken();
        console.log("The token part:    " + token);

        const emp = await Admin.find();

        if (req.body.password == req.body.confirm_password) {
            const registered = await data.save();
            // console.log(registered);
            // console.log(registered._id);
            res.redirect("employee");
            // res.render("employee");
        }
        else {
            res.render("employee", {
                emp,
                err: "Password and Confirm Password should be equal"
            });
        }
    }
    catch (e) {
        const emp = await Admin.find();
        // res.send("Form validation error");
        res.render("employee", {
            emp,
            err: "Enter correct details"
        });
        console.log("error is: " + e)
    }
});


app.put("/employee/:x", auth_admin, async (req, res) => {
    try {
        const Emp_id = req.params.x;
        // const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);
        const update = {
            role: req.body.role
        };

        const UpdatedEmployee = await Admin.findByIdAndUpdate({ _id: Emp_id }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/employee");
        // res.send("Product updated successfully");
    } catch (e) {
        res.status(404).send("Error is:    " + e);
    }
})


app.delete("/employee/:x", auth_admin, async (req, res) => {
    try {
        const Emp_id = req.params.x;
        // const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);

        const DeletedEmployee = await Admin.deleteOne({ _id: Emp_id });
        // console.log(DeletedEmployee);
        res.redirect("/employee");
        // res.send("Product updated successfully");
    } catch (e) {
        res.status(404).send("Error is:    " + e);
    }
})





app.get("/category", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && req.authenticatedAdmin.role == 'admin') {
            const distinctCategories = await category.find();
            const distinctCategoriesName = await category.find();
            for (let i = 0; i < distinctCategories.length; i++) {
                if (distinctCategoriesName[i].parentCategory != null) {
                    const parentCategoryObj = await category.findOne({ _id: distinctCategoriesName[i].parentCategory });
                    const parentCategoryName = parentCategoryObj.categoryName;
                    console.log(parentCategoryName)
                    distinctCategoriesName[i] = {
                        _id: distinctCategoriesName[i]._id,
                        categoryName: distinctCategoriesName[i].categoryName,
                        parentCategory: parentCategoryName,
                        customAttributes: distinctCategoriesName[i].customAttributes,
                        createdAt: distinctCategoriesName[i].createdAt,
                        updatedAt: distinctCategoriesName[i].updatedAt,
                    }
                }
            }
            res.render("category", { distinctCategories, distinctCategoriesName });
        }
        else {
            res.send("does not found")
        }
    } catch (error) {
        res.send(error)
    }
})

app.post("/category", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && req.authenticatedAdmin.role == 'admin') {
            // const parentCategory = req.body.parentCategory || null;

            const customAttributes = [];
            for (let i = 0; req.body[`customAttributes[${i}][name]`]; i++) {
                customAttributes.push({
                    name: req.body[`customAttributes[${i}][name]`],
                });
            }

            if (req.body.parentCategory !== 'null') {
                const cate = await category.findOne({ categoryName: req.body.parentCategory })
                var cate_id = cate._id;
            }
            else {
                var cate_id = null;
            }

            const category_data = new category({
                categoryName: req.body.categoryName,
                parentCategory: cate_id,
                customAttributes
            })

            await category_data.save();
            res.redirect("category");
        }
        else {
            res.send("does not found")
        }
    } catch (error) {
        res.send(error)
    }
});


app.delete("/category/:x", auth_admin, async (req, res) => {
    try {
        const cate_id = req.params.x;
        await category.updateMany({ parentCategory: cate_id }, { parentCategory: null });
        await category.deleteOne({ _id: cate_id });
        res.redirect("/category");
    } catch (error) {
        res.send(error);
    }
});







app.get("/sellerSignup", (req, res) => {
    res.render("seller/sellerSignup");
});

app.get("/sellerLogin", (req, res) => {
    res.render("seller/sellerLogin");
});

app.get("/seller_signup2", auth_seller, (req, res) => {
    try {
        if (req.authenticatedSeller) {
            if (req.authenticatedSeller.status == "incomplete") {
                res.render("seller/seller_signup2");
            }
            else if (req.authenticatedSeller.status == "complete") {
                res.redirect("seller_home");
            }
        }
        else {
            res.send("Page not found 2");
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller_home", auth_seller, async (req, res) => {
    try {
        const data = req.authenticatedSeller;
        const distinctCategories = await category.find();
        // const distinctCategories2 = await category.find({}, { _id: 0,parentCategory:0 ,'customAttributes._id': 0 });
        // console.log(distinctCategories2)
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });
            const threshold_crossed = await product.find({ $and: [{ sellerID: req.authenticatedSeller._id }, { status: "Approved" }, { $expr: { $gte: ["$threshold", "$stock"] } }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;
            const threshold_crossed_length = threshold_crossed.length;

            // res.render("seller_product/upload_product", { data, distinctCategories });
            res.render("seller/seller_home", { pending_products_length, rejected_products_length, approved_products_length, threshold_crossed_length });
        }
        else if (req.authenticatedSeller && req.authenticatedSeller.status == "incomplete") {
            res.redirect("seller_signup2");
        }
        else {
            res.redirect("/*");
        }



    } catch (error) {
        res.send(error)
    }
});

// Seller logout
app.get("/sellerLogout", auth_seller, async (req, res) => {
    // console.log(`Login token get    :   ${req.cookies.jwt_login}`);
    try {
        console.log(`Authenticated seller is:      ${req.authenticatedSeller}`);
        res.clearCookie("jwt_sellerlogin");
        console.log("logout successfully")

        await req.authenticatedSeller.save();
        res.redirect("sellerSignup");
    } catch (error) {
        res.status(500).send(error);
    }
});


// Seller Signup POST request
app.post("/sellerSignup", async (req, res) => {
    try {
        const data = new Seller({
            name: req.body.name,
            email: req.body.email,
            panNo: req.body.panNo,
            gstNo: req.body.gstNo,
            password: req.body.password
        });

        // call token
        const token = await data.generateAuthToken();
        console.log("The token part:    " + token);

        // store token in cookie
        // res.cookie(name,value,{options})
        res.cookie("jwt_seller", token, {
            expires: new Date(Date.now() + 20000),
            httpOnly: true
        });

        if (req.body.password == req.body.confirm_password) {
            const seller_registered = await data.save();
            // console.log(registered);
            // console.log(registered._id);

            res.redirect("/sellerLogin");
        }
        else {
            res.render("seller/sellerSignup", {
                err: "Password and Confirm Password should be equal"
            });
        }
    }
    catch (e) {
        // res.send("Form validation error");
        res.render("seller/sellerSignup", {
            err: "Enter correct details"
        });
        console.log("error is: " + e)
    }
});


// Seller login POST request
app.post("/sellerLogin", async (req, res) => {
    try {
        const check = await Seller.findOne({ email: req.body.email });
        // compare hashed password and enter password
        const isMatch = await bcrypt.compare(req.body.password, check.password);
        console.log(`Compare hashed password and enter password: ${isMatch}`);

        const token = await check.generateAuthToken();
        console.log("The token part:    " + token);

        if (isMatch) {
            if (check.active == true) {
                res.cookie("jwt_sellerlogin", token, {
                    //    expires: new Date(Date.now() + 20000),
                    httpOnly: true
                });

                console.log(check.status);
                if (check.status == "incomplete") {
                    res.redirect("seller_signup2");
                }
                else {
                    res.redirect("seller_home");
                }
                //console.log("this is home");
            }
            else if(check.active==false){
                res.render("seller/sellerLogin", {
                    // err: "Wrong password"
                    err: "Temporarily banned"
                });
            }
        }
        else {
            // res.send("Wrong password");
            res.render("seller/sellerLogin", {
                // err: "Wrong password"
                err: "Wrong details"
            });
        }
    }
    catch (e) {
        // res.send("Wrong details");
        res.render("seller/sellerLogin", {
            err: "Wrong details"
        });
        console.log(e);
    }
});


app.put("/seller_signup2", auth_seller, async (req, res) => {
    try {
        const seller_id = req.authenticatedSeller._id;
        const update = {
            contactNo: req.body.contactNo,
            storeName: req.body.storeName,
            contactNo: req.body.contactNo,
            address: {
                street: req.body.street1,
                city: req.body.city1,
                state: req.body.state1,
                zipcode: req.body.zipcode1,
                fullAddr: req.body.fullAddr1
            },
            pickupAddress: {
                street: req.body.street2,
                city: req.body.city2,
                state: req.body.state2,
                zipcode: req.body.zipcode2,
                fullAddr: req.body.fullAddr2
            },
            status: "complete"
        };
        const UpdatedSeller = await Seller.findByIdAndUpdate({ _id: seller_id }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/seller_home");
        // res.send("Product updated successfully");
    } catch (error) {
        res.send(error);
    }
});


app.get("/seller_editprofile", auth_seller, async (req, res) => {
    try {
        const sellerData = req.authenticatedSeller;
        const distinctCategories = await category.find();
        // const distinctCategories2 = await category.find({}, { _id: 0,parentCategory:0 ,'customAttributes._id': 0 });
        // console.log(distinctCategories2)
        if (req.authenticatedSeller) {
            // res.render("seller_product/upload_product", { data, distinctCategories });
            res.render("seller/seller_editProfile", { sellerData });
        }
        else {
            res.redirect("/*");
        }

    } catch (error) {
        res.send(error)
    }
});


app.put("/seller_editprofile", auth_seller, async (req, res) => {
    try {
        const seller_id = req.authenticatedSeller._id;
        const update = {
            contactNo: req.body.contactNo,
            storeName: req.body.storeName,
            contactNo: req.body.contactNo,
            address: {
                street: req.body.street1,
                city: req.body.city1,
                state: req.body.state1,
                zipcode: req.body.zipcode1,
                fullAddr: req.body.fullAddr1
            },
            pickupAddress: {
                street: req.body.street2,
                city: req.body.city2,
                state: req.body.state2,
                zipcode: req.body.zipcode2,
                fullAddr: req.body.fullAddr2
            },
            //status: "complete"
        };
        const UpdatedSeller = await Seller.findByIdAndUpdate({ _id: seller_id }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/seller_home");
        // res.send("Product updated successfully");
    } catch (error) {
        res.send(error);
    }
});



app.get("/upload_product", auth_seller, async (req, res) => {
    try {
        const data = req.authenticatedSeller;
        const distinctCategories = await category.find();
        // const distinctCategories2 = await category.find({}, { _id: 0,parentCategory:0 ,'customAttributes._id': 0 });
        // console.log(distinctCategories2)
        if (req.authenticatedSeller) {
            if (req.authenticatedSeller.status == "complete") {
                res.render("seller_product/upload_product", { data, distinctCategories });
            }
            else {
                res.send("First add full details.")
            }
        }
        else {
            res.redirect("/*");
        }
    } catch (error) {
        res.send(error);
    }
});



// Define the route to handle the request for fetching custom attributes
app.get('/getCustomAttributes', async (req, res) => {
    try {
        const categoryName = req.query.categoryName;

        // Find the category document based on the categoryName
        const cate = await category.findOne({ categoryName });

        if (!cate) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Extract custom attributes from the category document
        const customAttributes = cate.customAttributes;

        // Respond with the custom attributes
        res.status(200).json({ customAttributes });
    } catch (error) {
        console.error('Error fetching custom attributes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post("/upload_product", auth_seller, upload.single("image_link"), async (req, res) => {
    try {
        // console.log(req.body);

        let full_image_link = req.file.path;
        let cut_image_link = full_image_link.slice(6);
        // console.log(cut_image_link);

        const { productName, productDescription, productCategory, customAttributes, stock, threshold, price, discountPercentage, discountedPrice } = req.body;

        const pdata = new product({
            productName,
            productDescription,
            productImage: cut_image_link,
            sellerID: req.authenticatedSeller._id,
            productCategory,
            customAttributes,
            stock,
            threshold,
            price,
            discountPercentage,
            discountedPrice
        })

        console.log(req.body)

        await pdata.save();

        res.redirect("upload_product");
    }
    catch (e) {
        // res.send("Form validation error");
        res.render("upload_product", {
            nam2: username,
            err: "Enter products"
        });
        console.log(e)
    }
});



app.get("/update_product/:x", auth_seller, async (req, res) => {
    try {
        const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);

        const getIndividualProduct = await product.findOne({ _id: a });

        if (req.authenticatedSeller && `${getIndividualProduct.sellerID}` == `${req.authenticatedSeller._id}`) {
            if (getIndividualProduct.status == "Pending" || getIndividualProduct.status == "Rejected") {
                // const a = req.params.x;
                // // console.log(req.params);
                console.log(a);
                // // res.send(req.params);

                // const getIndividualProduct = await product.findOne({ _id: a });

                const distinctCategories = await category.find();

                const features = getIndividualProduct.customAttributes;

                // console.log(getIndividualProduct);
                res.render("seller_product/update_product", {
                    _id: getIndividualProduct._id,
                    productName: getIndividualProduct.productName,
                    productDescription: getIndividualProduct.productDescription,
                    productImage: getIndividualProduct.productImage,
                    productCategory: getIndividualProduct.productCategory,
                    stock: getIndividualProduct.stock,
                    threshold: getIndividualProduct.threshold,
                    price: getIndividualProduct.price,
                    discountPercentage: getIndividualProduct.discountPercentage,
                    discountedPrice: getIndividualProduct.discountedPrice,
                    distinctCategories,
                    features,
                    status: getIndividualProduct.status,
                    message: getIndividualProduct.message
                });
            }
            else if (getIndividualProduct.status == "Approved") {

                const distinctCategories = await category.find();

                const features = getIndividualProduct.customAttributes;

                res.render("seller_product/update_approved_product", {
                    _id: getIndividualProduct._id,
                    productName: getIndividualProduct.productName,
                    productDescription: getIndividualProduct.productDescription,
                    productImage: getIndividualProduct.productImage,
                    productCategory: getIndividualProduct.productCategory,
                    stock: getIndividualProduct.stock,
                    threshold: getIndividualProduct.threshold,
                    price: getIndividualProduct.price,
                    discountPercentage: getIndividualProduct.discountPercentage,
                    discountedPrice: getIndividualProduct.discountedPrice,
                    distinctCategories,
                    features
                });

                // res.send("Hamba")
            }

        }
        else {
            res.send("page not found");
        }

    } catch (e) {
        res.status(404).send(e);
    }
});



app.put("/product_update/:x", auth_seller, upload.single("image_link"), async (req, res) => {
    try {
        const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);

        let full_image = req.file;
        if (full_image != null) {
            var full_image_link = req.file.path;
            var cut_image_link = full_image_link.slice(6);
            // console.log(cut_image_link);

            fs.unlink(`\public${req.body.productImage}`, (err) => {
                console.log(err);
            });
        }
        else {
            var cut_image_link = req.body.productImage;
        }

        const { productName, productDescription, productCategory, stock, threshold, price, discountPercentage, discountedPrice } = req.body;
        const updatedCustomAttributes = req.body.customAttributes || [];
        // console.log(updatedCustomAttributes);
        // console.log(req.body);

        const update = {
            productName,
            productDescription,
            productImage: cut_image_link,
            productCategory,
            customAttributes: updatedCustomAttributes,
            stock,
            threshold,
            price,
            discountPercentage,
            discountedPrice,
            status: "Pending"
        }

        const UpdatedProduct = await product.findByIdAndUpdate({ _id: a }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/seller/product_list");
        // res.send("Product updated successfully");

    } catch (e) {
        res.status(404).send("Siiiuuuuu:    " + e);
    }
});


app.put("/approved_product_update/:x", auth_seller, async (req, res) => {
    try {
        const a = req.params.x;
        // console.log(req.params);
        // console.log(a);
        // res.send(req.params);

        const { stock, threshold, price, discountPercentage, discountedPrice } = req.body;
        // const updatedCustomAttributes = req.body.customAttributes || [];
        // console.log(updatedCustomAttributes);
        // console.log(req.body);

        const update = {
            stock,
            threshold,
            price,
            discountPercentage,
            discountedPrice
        }

        const UpdatedProduct = await product.findByIdAndUpdate({ _id: a }, update, { new: true, runValidators: true });
        // console.log(UpdatedProduct);
        res.redirect("/seller/product_list");
        // res.send("Product updated successfully");

    } catch (e) {
        res.status(404).send("Siiiuuuuu:    " + e);
    }
});


app.get("/seller/product_list", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const items = await product.find({ $and: [{ sellerID: req.authenticatedSeller._id }, { status: { $ne: "Deleted" } }] });

            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;
            // console.log(items);
            res.render("seller_product/seller_product_list", { items, pending_products_length, rejected_products_length, approved_products_length });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller/approved_product_list", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const items = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });
            // console.log(items);

            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;

            res.render("seller_product/seller_product_list", { items, pending_products_length, rejected_products_length, approved_products_length });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller/pending_product_list", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const items = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            // console.log(items);

            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;

            res.render("seller_product/seller_product_list", { items, pending_products_length, rejected_products_length, approved_products_length });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller/rejected_product_list", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const items = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            // console.log(items);

            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;

            res.render("seller_product/seller_product_list", { items, pending_products_length, rejected_products_length, approved_products_length });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
});






// ******************************** Order ***************************
app.get("/order_now", auth, async (req, res) => {
    try {
        const productDtls = await product.findOne({ _id: req.query.pID });
        const authUser = await User.findOne({ _id: req.authenticatedUser._id })

        // console.log(productDtls)
        // orderdetails = { ...orderdetails, ...req.query };
        // console.log(orderdetails)
        console.log(req.query.pID)
        // await res.send(orderdetails)

        if (productDtls.stock > 0) {
            await res.render("order/order_now", {
                productImage: productDtls.productImage,
                pName: productDtls.productName,
                pid: productDtls._id,
                MRP: productDtls.price,
                BuyingPrice: productDtls.discountedPrice,
                stock: productDtls.stock,
                authUser
            });
        }
        else {
            res.send("product is out of stock");
        }

    } catch (error) {
        res.send("You have to login.");
    }
});



app.post("/order_now", auth, async (req, res) => {
    try {
        // const totalAmount = orderdetails.products[0].quantity * orderdetails.products[0].BuyingPrice;

        const pid = req.body.pID;
        console.log(pid)
        const SingleProduct = await product.findOne({ _id: pid });
        const sumAmount = SingleProduct.discountedPrice * req.body.quantity;
        console.log(SingleProduct.discountedPrice)
        const OrderData = new order({
            uID: req.authenticatedUser._id,
            totalAmount: sumAmount,
            orderStatus: "Order Placed",
            orderDate: Date.now(),

            products: [
                {
                    pID: pid,
                    quantity: req.body.quantity,
                    MRP: SingleProduct.price,
                    BuyingPrice: SingleProduct.discountedPrice,
                    Total: req.body.quantity * SingleProduct.discountedPrice,
                    processOrder: [{
                        Status: "Order placed",
                        Date: Date.now()
                    }]
                }
            ],

            shippingDetails: {
                Name: req.body.Name,
                contactNo: req.body.contactNo,
                street: req.body.street,
                city: req.body.city,
                state: req.body.state,
                zipcode: req.body.zipcode,
                fullAddr: req.body.fullAddr
            },
        });

        // console.log(OrderData)

        const updatedStock = (SingleProduct.stock - req.body.quantity);
        if (updatedStock >= 0) {
            const orderdetails = await OrderData.save();
            await product.updateOne({ _id: pid }, { stock: updatedStock });
            console.log(orderdetails)
            // await res.send(orderdetails)
            // await res.json(orderdetails)
            // res.send("Order placed successfully.")
            res.redirect("/allorders");
        }
        else {
            res.send("Out of Stock")
        }

        // if(updatedStock>=0){
        //     await orderData.save();

        //     //update product table to reduce stock
        //     await product.updateOne({ _id: orderdetails.products[0].pID }, { stock: updatedStock });
        //     console.log(orderdetails)
        //     await res.send(orderdetails)
        // }
        // else{
        //     await res.send("Out of Stocks");
        // }
    } catch (error) {
        res.send(error)
    }
});



app.get("/order_list", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            const orderItems = await order.find({ sellerID: req.authenticatedSeller._id });
            res.render("seller_product/order_list", { orderItems });
        }
        else {
            res.send("page not found")
        }
    } catch (error) {
        res.send(error);
    }
});




app.get("/user_list", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "User Manager")) {
            const users = await User.find();
            res.render("admin/user", { users });
        }
        else {
            res.send("You cannot access this page")
        }
    } catch (error) {
        res.send(error);
    }
})


app.get("/admin/user/:x", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "User Manager")) {
            const a = req.params.x;
            const IndividualUser = await User.findOne({ _id: a });
            res.render("admin/user_details", {
                indi: IndividualUser

            });
        }
        else {
            res.send("You cannot access this page")
        }
    } catch (error) {
        res.send(error);
    }
});



app.put("/user/:x", auth_admin, async (req, res) => {
    try {
        const a = req.params.x;
        const user_profile = await User.findOne({ _id: a });
        const user_active = await user_profile.active;
        if (user_active == true) {
            await User.findOneAndUpdate({ _id: user_profile._id }, { active: false });
        }
        else if (user_active == false) {
            await User.findOneAndUpdate({ _id: user_profile._id }, { active: true });
        }
        res.redirect("/user_list");
    } catch (error) {
        res.send(error)
    }

});


app.get("/seller_list", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "User Manager")) {
            const sellers = await Seller.find();
            res.render("admin/seller_list", { sellers });
        }
        else {
            res.send("You cannot access this page")
        }
    } catch (error) {
        res.send(error);
    }
});


app.get("/admin/seller/:x", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "User Manager")) {
            const a = req.params.x;
            const IndividualSeller = await Seller.findOne({ _id: a });
            res.render("admin/seller_details", {
                indi: IndividualSeller
            });
        }
        else {
            res.send("You cannot access this page")
        }
    } catch (error) {
        res.send(error);
    }
});


app.put("/seller/:x", auth_admin, async (req, res) => {
    try {
        const a = req.params.x;
        const seller_profile = await Seller.findOne({ _id: a });
        const seller_active = await seller_profile.active;
        if (seller_active == true) {
            await Seller.findOneAndUpdate({ _id: seller_profile._id }, { active: false });
            await product.updateMany({ sellerID: req.params.x }, { status: "Inactive" });
        }
        else if (seller_active == false) {
            await Seller.findOneAndUpdate({ _id: seller_profile._id }, { active: true });
            await product.updateMany({ sellerID: req.params.x }, { status: "Approved" });
        }
        res.redirect("/seller_list");
    } catch (error) {
        res.send(error)
    }

});


// ******************************** buy and cart codes *********************************
app.post("/buy_from_cart", async (req, res) => {
    try {
        // Initialize an empty array to store product details
        let productDetails = [];

        // Loop through the keys in req.body
        for (const key in req.body) {
            // Check if the key starts with "pID"
            if (key.startsWith("pID")) {
                // Extract the index from the key
                const index = parseInt(key.match(/\d+/)[0]);

                // Create a product object and push it to the array
                productDetails.push({
                    pID: req.body[`pID[${index}]`],
                    quantity: req.body[`quantity[${index}]`]
                    // Add more properties as needed
                });
            }
        }

        req.session.productDetails = productDetails;

        // Send the array of product details as the response
        // res.json(productDetails);
        res.redirect("/cart_order_now");
    } catch (error) {
        res.send(error);
    }
});



app.get("/cart_order_now", auth, async (req, res) => {
    try {
        const productDetails = req.session.productDetails;
        const buyProducts = [];
        const authUser = await User.findOne({ _id: req.authenticatedUser._id });

        for (const element of productDetails) {
            console.log(element.pID);
            const products = await product.findOne({ _id: element.pID });
            // console.log(products);
            const products2 = { ...products._doc, quantity: element.quantity };
            buyProducts.push(products2);
        }

        console.log(buyProducts);
        // res.send(buyProducts);
        res.render('order/cart_order_now', { buyProducts, authUser });
    } catch (error) {
        res.send(error);
    }
});


app.post("/cart_order_now", auth, async (req, res) => {
    try {
        // res.send(req.body);
        const order_arr = [];
        let total = 0;
        var order_able = true;
        for (let i = 0; i < req.body.pID.length; i++) {
            const find_product = await product.findOne({ _id: req.body.pID[i] })

            // order_arr.push({pID: req.body.pID[i], quantity: req.body.quantity[i], MRP: req.body.MRP[i], BuyingPrice: req.body.BuyingPrice[i]});
            if (find_product.stock >= req.body.quantity[i]) {
                order_arr.push({
                    pID: req.body.pID[i], quantity: req.body.quantity[i], MRP: find_product.price, BuyingPrice: find_product.discountedPrice, Total: req.body.quantity[i] * find_product.discountedPrice,
                    processOrder: [{
                        Status: "Order placed",
                        Date: Date.now()
                    }]
                });

                total = total + (find_product.discountedPrice * req.body.quantity[i]);
            }
            else {
                order_able = false;
            }

        };
        if (order_able == true) {
            for (let i = 0; i < req.body.pID.length; i++) {
                const SingleProduct = await product.findOne({ _id: req.body.pID[i] });
                const updatedStock = (SingleProduct.stock - req.body.quantity[i]);
                await product.updateOne({ _id: req.body.pID[i] }, { stock: updatedStock });
            }
            const orderdetails = new order({
                uID: req.authenticatedUser._id,
                orderDate: Date.now(),
                totalAmount: total,
                orderStatus: "Order Placed",
                products: order_arr,
                shippingDetails: {
                    Name: req.body.Name,
                    contactNo: req.body.contactNo,
                    street: req.body.street,
                    city: req.body.city,
                    state: req.body.state,
                    zipcode: req.body.zipcode,
                    fullAddr: req.body.fullAddr
                }

            });

            await orderdetails.save()
            // res.send(order_arr);
            // res.send(orderdetails);
            res.redirect("/allorders");
        }
        else {
            res.send("Problem in place order. Some product might be out of stock.")
        }
    } catch (error) {
        res.send(error);
    }
});



app.get("/allorders", auth, async (req, res) => {
    try {
        if (req.authenticatedUser) {
            const allorders = await order.find({ uID: req.authenticatedUser._id }).populate('products.pID');
            // console.log(allorders);
            // res.send(allorders);
            res.render("order/allorders", { allorders });

        } else {
            res.send("You are not authorized to access this page. Do login to access this page.");
        }
    } catch (error) {
        res.send(error);
    }
});


app.get("/orderDetails/:x", auth, async (req, res) => {
    try {
        if (req.authenticatedUser) {
            const allorders = await order.find({ uID: req.authenticatedUser._id });

            for (const iterator of allorders) {
                // console.log(iterator);
                var temp = 0;
                var OrderID = iterator;
                for (const items of iterator.products) {
                    // console.log(items._id);
                    if (items._id == req.params.x) {
                        var Order_subID = items;
                        temp = 1;

                        // console.log(Order_subID);
                        var process_order_length = Order_subID.processOrder.length;
                        // console.log(process_order_length);
                        if (process_order_length == 1) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: "",
                                Status3: "Delivered",
                                Date3: ""
                            }
                        }
                        else if (process_order_length == 2) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: Order_subID.processOrder[1].Date,
                                Status3: "Delivered",
                                Date3: ""
                            }
                        }
                        else if (process_order_length == 3) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: Order_subID.processOrder[1].Date,
                                Status3: "Delivered",
                                Date3: Order_subID.processOrder[2].Date
                            }

                        }

                        break;
                    }
                }
                if (temp == 1) {
                    break;
                }
            }
            // res.send(allorders);
            const Order_product = await product.findOne({ _id: Order_subID.pID }).populate('sellerID');

            if (process_order_length == 3) {
                var check_review = await review.findOne({ $and: [{ UID: req.authenticatedUser._id }, { PID: Order_product._id }] });
                //send invoice button*****************
                var in_voice = `<button type="button" id="confirmAddressBtn" onclick="downloadInvoice('${Order_subID._id}')"
                class="download">Invoice</button>`;
                if (check_review == null) {
                    var add_review_btn = `<button type="button" id="confirmAddressBtn" onclick="giveReview('${Order_product._id}')">Review</button>`;

                    var add_review_box = `<form action="/review_post/${Order_product._id}" method="post" id="add_review" style="display: none;">
                    <span class="cancel" onclick="cancel1()">X</span>
                    <div class="rating" id="rating">
                      <span class="star" data-value="1">&#9733;</span>
                      <span class="star" data-value="2">&#9733;</span>
                      <span class="star" data-value="3">&#9733;</span>
                      <span class="star" data-value="4">&#9733;</span>
                      <span class="star" data-value="5">&#9733;</span>
                    </div>
                    <input type="text" name="ratings" class="hide">
                    <textarea id="review" name="review" placeholder="Write your review here..."></textarea>
                    <button id="submit">Submit</button>
                  </form>`
                    // var edit_review_btn=null;
                }
                else {
                    var edit_review_btn = `<button type="button" id="confirmAddressBtn" onclick="editReview('${Order_product._id}')">Edit Review</button>`;
                    var ratings = check_review.ratings;
                    var review_comment = check_review.review;

                    var edit_review_box = `<form action="/review_update/${Order_product._id}?_method=PUT" method="post" id="update_review"
                    style="display: none;">
                    <span class="cancel" onclick="cancel2()">X</span>
                    <div class="rating" id="rating">
                      <span class="star" data-value="1">&#9733;</span>
                      <span class="star" data-value="2">&#9733;</span>
                      <span class="star" data-value="3">&#9733;</span>
                      <span class="star" data-value="4">&#9733;</span>
                      <span class="star" data-value="5">&#9733;</span>
                    </div>
                    <input type="text" name="ratings" class="hide" value=${ratings}>
                    <textarea id="review" name="review" placeholder="Write your review here...">${review_comment}</textarea>
                    <button id="submit">Submit</button>
                  </form>`
                    // var add_review_btn=null;
                }
            }
            // res.send({ OrderID, Order_product, Order_subID, process_order });
            res.render("order/orderDetails", { OrderID, Order_product, Order_subID, process_order, add_review_btn, edit_review_btn, add_review_box, edit_review_box, in_voice });

        } else {
            res.send("You are not authorized to access this page.");
        }

    } catch (error) {
        res.send(error);
    }
});


// Endpoint to generate and download the PDF invoice
app.get('/download-invoice/:x', auth, async (req, res) => {
    try {
        if (req.authenticatedUser) {
            const allorders = await order.find({ uID: req.authenticatedUser._id });

            for (const iterator of allorders) {
                // console.log(iterator);
                var temp = 0;
                var OrderID = iterator;
                for (const items of iterator.products) {
                    // console.log(items._id);
                    if (items._id == req.params.x) {
                        var Order_subID = items;
                        temp = 1;

                        // console.log(Order_subID);
                        const process_order_length = Order_subID.processOrder.length;
                        // console.log(process_order_length);
                        if (process_order_length == 1) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: "",
                                Status3: "Delivered",
                                Date3: ""
                            }
                        }
                        else if (process_order_length == 2) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: Order_subID.processOrder[1].Date,
                                Status3: "Delivered",
                                Date3: ""
                            }
                        }
                        else if (process_order_length == 3) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: Order_subID.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: Order_subID.processOrder[1].Date,
                                Status3: "Delivered",
                                Date3: Order_subID.processOrder[2].Date
                            }
                        }

                        break;
                    }
                }
                if (temp == 1) {
                    break;
                }
            }
        }
        // res.send(allorders);
        var Order_product = await product.findOne({ _id: Order_subID.pID }).populate('sellerID');
        // res.send({ OrderID, Order_product, Order_subID, process_order });


        const orderId = req.params.x;
        // const order = getOrderFromDatabase(orderId);
        // const order = { OrderID, Order_product, Order_subID, process_order };
        // console.log(OrderID)
        // console.log(Order_product)
        // console.log(Order_subID)
        // console.log(process_order)
        const ordr = { OrderID, Order_product, Order_subID, process_order, customerName: req.authenticatedUser.name };
        // console.log(ordr);
        // res.send(ordr);
        // const invoiceHtml = renderInvoiceTemplate(OrderID, Order_product, Order_subID,process_order);

        const invoiceHtml = renderInvoiceTemplate(ordr);

        pdf.create(invoiceHtml).toBuffer((err, buffer) => {
            if (err) {
                return res.status(500).send('Error generating PDF');
            }

            const fileName = `invoice_${orderId}.pdf`;
            fs.writeFile(fileName, buffer, (err) => {
                if (err) {
                    return res.status(500).send('Error saving PDF');
                }

                res.download(fileName, () => {
                    fs.unlinkSync(fileName); // Delete the temporary PDF file after download
                });
            });
        });
    } catch (error) {
        res.send("error");
    }
});


function renderInvoiceTemplate(ordr) {
    // Replace this with your logic to render the invoice template
    return `
    <html>
    <head>
        <title>Invoice</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 800px;
                height: 1080px;
                margin: 0px auto;
                padding: 20px;
                border: 1px solid #ccc;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header h1 {
                color: #00366f;
            }
            .section {
                margin-bottom: 20px;
                position: relative;
                border-bottom: 1px solid #ccc; /* Add border between sections */
            }
            .section h2 {
                color: #00366f;
                margin-bottom: 10px;
            }
            .section p {
                margin: 5px 0;
            }
            .left-section {
                float: left;
                width: 49%;
                padding-right: 1%;
                margin-bottom: 25px;
            }
            .right-section {
                float: right;
                width: 49%;
                padding-left: 1%;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            table th, table td {
                padding: 8px;
                border: 1px solid #ddd;
            }
            table th {
                background-color: #f2f2f2;
                text-align: left;
            }
            table td {
                text-align: left;
            }
            .total {
                font-weight: bold;
                text-align: right;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>INVOICE</h1>
                <p>Order ID: ${ordr.OrderID._id}</p>
                <p>Invoice Number: ${ordr.Order_subID._id}</p>
                <p>Order Date: ${ordr.process_order.Date1}</p>
                <p>Delivery Date: ${ordr.process_order.Date3}</p>
            </div>
            <div class="section section2">
                <div class="left-section">
                    <h2>Seller Details</h2>
                    <p>Name: ${ordr.Order_product.sellerID.name}</p>
                    <p>GST ID: ${ordr.Order_product.sellerID.gstNo}</p>
                    <p>Store Name: ${ordr.Order_product.sellerID.storeName}</p>
                </div>
                <div class="right-section">
                    <h2>Bill-From Address</h2>
                    <p>Street: ${ordr.Order_product.sellerID.pickupAddress.street}</p>
                    <p>City: ${ordr.Order_product.sellerID.pickupAddress.city}</p>
                    <p>State: ${ordr.Order_product.sellerID.pickupAddress.state}</p>
                    <p>Pin: ${ordr.Order_product.sellerID.pickupAddress.zipcode}</p>
                </div>
            </div>
            <div class="section">
                <h2>Customer Details</h2>
                <p>Name: ${ordr.customerName}</p>
            </div>
            <div class="section">
                <h2>Shipping Details</h2>
                <p>Name: ${ordr.OrderID.shippingDetails.Name}
                , Contact No: ${ordr.OrderID.shippingDetails.contactNo}</p>
                <p>Street: ${ordr.OrderID.shippingDetails.street}
                , City: ${ordr.OrderID.shippingDetails.city}
                , State: ${ordr.OrderID.shippingDetails.state}
                , Pin: ${ordr.OrderID.shippingDetails.zipcode}</p>
                <p>Full Address: ${ordr.OrderID.shippingDetails.fullAddr}
                , Landmark: {ordr.OrderID.shippingDetails.landmark}</p>
            </div>
            <div class="section">
                <h2>Product Details</h2>
                <table>
                    <tr>
                        <th>Product Name</th>
                        <th>Quantity</th>
                        <th>Taxable Amount</th>
                        <th>SGST</th>
                        <th>CGST</th>
                        <th>Total Price</th>
                    </tr>
                    <tr>
                        <td>${ordr.Order_product.productName}</td>
                        <td>${ordr.Order_subID.quantity}</td>
                        <td>${Math.round(ordr.Order_subID.Total * (100 / 118))}</td>
                        <td>${((ordr.Order_subID.Total) - (Math.round(ordr.Order_subID.Total * (100 / 118)))) / 2}</td>
                        <td>${((ordr.Order_subID.Total) - (Math.round(ordr.Order_subID.Total * (100 / 118)))) / 2}</td>
                        <td>${ordr.Order_subID.Total}</td>
                    </tr>
                </table>
            </div>
            <div class="total">
                <p>Total Amount: ${ordr.Order_subID.Total}</p>
            </div>
            <div class="thank-you">
                <p>Thank You for Your Business!</p>
            </div>
        </div>
    </body>
    </html>
    `;
}


app.get("/pending_products", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "Product Manager" || req.authenticatedAdmin.role == "admin")) {
            const items = await product.find({ status: "Pending" }).sort({ updatedAt: 1 });
            res.render("product_manager/pending_products", { items });
            // res.send("ALL PENDING PRODUCTS");
        }
        else {
            res.send("Page does not exist.")
        }
    } catch (error) {
        res.send(error);
    }
});


app.get("/pending_product_details/:x", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "Product Manager" || req.authenticatedAdmin.role == "admin")) {
            const pending_product = await product.findOne({ _id: req.params.x });
            console.log(pending_product)

            res.render("product_manager/pending_product_details", { pending_product });
        }
        else {
            res.send("Page does not exist.");
        }
    } catch (error) {
        res.send("Page does not exist.");
    }
});


app.get("/admin_product_details/:x", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && (req.authenticatedAdmin.role == "admin" || req.authenticatedAdmin.role == "Product Manager")) {
            const product_details = await product.findOne({ _id: req.params.x });
            console.log(product_details);
            res.render("admin/product_details", { product_details });
        }
        else {
            res.send("Page does not exist.");
        }
    } catch (error) {
        res.send("Page does not exist.");
    }
});



// ********************************* Seller ****************************************
app.get("/product_details/:x", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            const product_details = await product.findOne({ _id: req.params.x });
            console.log(product_details);
            if (`${product_details.sellerID}` == `${req.authenticatedSeller._id}`) {
                res.render("seller_product/product_details", { product_details });
            }
            else {
                res.send("Page does not exist.");
            }

        }
        else {
            res.send("Page does not exist.");
        }
    } catch (error) {
        res.send("Page does not exist.");
    }
});



app.put("/approve_product/:x", async (req, res) => {
    try {
        await product.updateOne({ _id: req.params.x }, { status: req.body.status, message: req.body.message });
        res.redirect("/pending_products");
    } catch (error) {
        res.send(error);
    }
});


app.get("/seller_allorders", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            // console.log(req.authenticatedSeller);
            const allorders = await order.find().populate('uID').populate('products.pID');
            // console.log(allorders);
            // res.send(allorders);
            var arr = [];
            for (const iterator of allorders) {
                var temp = 0;
                for (var items of iterator.products) {
                    // console.log("ID1: "+items.pID.sellerID);
                    // console.log("ID2: "+req.authenticatedSeller._id);
                    // break;
                    if (`${items.pID.sellerID}` == `${req.authenticatedSeller._id}`) {
                        // console.log("Success");
                        temp = 1;
                    }
                    // console.log(iterator);
                    if (temp == 1) {
                        arr.push({ _id: iterator._id, uID: iterator.uID, products: items });
                    }
                    temp = 0;
                }
                // break;
            }
            res.render("seller/order/seller_allorders", { arr });
            // res.send(arr);
            // res.send(arr[0]);
            // res.send("success");

        } else {
            res.send("You are not authorized to access this page.");
        }
    } catch (error) {
        res.send(error);
    }
});


app.get("/seller_orderDetails/:x", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            // console.log(req.authenticatedSeller);
            const allorders = await order.find().populate('uID').populate('products.pID');
            // console.log(allorders);
            // res.send(allorders);
            var obj;
            var temp2 = 0;
            for (const iterator of allorders) {
                var temp = 0;
                for (var items of iterator.products) {
                    // console.log("ID1: "+items.pID.sellerID);
                    // console.log("ID2: "+req.authenticatedSeller._id);
                    // break;
                    if (`${items.pID.sellerID}` == `${req.authenticatedSeller._id}`) {
                        // console.log("Success");
                        temp = 1;
                    }
                    // console.log(iterator);
                    if (temp == 1 && items._id == req.params.x) {
                        obj = { _id: iterator._id, uID: iterator.uID, products: items, shippingDetails: iterator.shippingDetails };
                        temp2 = 1;


                        const current_order_status = obj.products.processOrder[obj.products.processOrder.length - 1];

                        const process_order_length = obj.products.processOrder.length;
                        console.log(process_order_length);
                        if (process_order_length == 1) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: obj.products.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: "",
                                Status3: "Delivered",
                                Date3: ""
                            }
                        }
                        else if (process_order_length == 2) {
                            console.log(Date.now())
                            const shipped_time = new Date(obj.products.processOrder[1].Date).getTime();
                            console.log(shipped_time)
                            if (Date.now() >= (shipped_time + 60000)) {
                                var process_order = {
                                    Status1: "Order Placed",
                                    Date1: obj.products.processOrder[0].Date,
                                    Status2: "Shipped",
                                    Date2: obj.products.processOrder[1].Date,
                                    Status3: "Delivered",
                                    Date3: shipped_time + 60000
                                }
                            }
                            else {
                                var process_order = {
                                    Status1: "Order Placed",
                                    Date1: obj.products.processOrder[0].Date,
                                    Status2: "Shipped",
                                    Date2: obj.products.processOrder[1].Date,
                                    Status3: "Delivered",
                                    Date3: ""
                                }
                            }
                        }
                        else if (process_order_length == 3) {
                            var process_order = {
                                Status1: "Order Placed",
                                Date1: obj.products.processOrder[0].Date,
                                Status2: "Shipped",
                                Date2: obj.products.processOrder[1].Date,
                                Status3: "Delivered",
                                Date3: obj.products.processOrder[2].Date
                            }
                        }
                        // res.send(current_order_status);
                        // res.send(obj);
                        // console.log(process_order)

                        res.render("seller/order/seller_orderDetails", { obj, current_order_status, process_order });
                        break;
                    }
                    temp = 0;
                }
                if (temp2 == 1) {
                    break;
                }
            }
            if (temp2 == 0) {
                res.send("You are not authorized to access this page.");
            }
            // res.render("seller/order/seller_orderDetails",{obj});
            // res.send(obj);
        } else {
            res.send("You are not authorized to access this page.");
        }

    } catch (error) {
        res.send(error);
    }
});


app.get("/seller_processOrder/:x", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            // console.log(req.authenticatedSeller);
            const allorders = await order.find().populate('uID').populate('products.pID');
            // console.log(allorders);
            // res.send(allorders);
            var obj;
            var temp2 = 0;
            for (const iterator of allorders) {
                var temp = 0;
                for (var items of iterator.products) {
                    // console.log("ID1: "+items.pID.sellerID);
                    // console.log("ID2: "+req.authenticatedSeller._id);
                    // break;
                    if (`${items.pID.sellerID}` == `${req.authenticatedSeller._id}`) {
                        // console.log("Success");
                        temp = 1;
                    }
                    // console.log(iterator);
                    if (temp == 1 && items._id == req.params.x) {
                        obj = { _id: iterator._id, uID: iterator.uID, products: items, shippingDetails: iterator.shippingDetails };
                        temp2 = 1;


                        const current_order_status = obj.products.processOrder[obj.products.processOrder.length - 1];
                        console.log(current_order_status);
                        // res.send(current_order_status);
                        // res.send(obj);

                        res.status(200).json({ current_order_status });
                        break;
                    }
                    temp = 0;
                }
                if (temp2 == 1) {
                    break;
                }
            }
            if (temp2 == 0) {
                res.status(404).json({ error: "You are not authorized to access this page." });
            }
            // res.render("seller/order/seller_orderDetails",{obj});
            // res.send(obj);
        } else {
            res.status(404).json({ error: "You are not authorized to access this page." });
        }

    } catch (error) {
        res.status(404).json({ error });
    }
});


app.put("/seller_processOrder/:x", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller) {
            // console.log(req.authenticatedSeller);
            const allorders = await order.find().populate('uID').populate('products.pID');
            // console.log(allorders);
            // res.send(allorders);
            var obj;
            var temp2 = 0;
            for (const iterator of allorders) {
                var temp = 0;
                for (var items of iterator.products) {
                    // console.log("ID1: "+items.pID.sellerID);
                    // console.log("ID2: "+req.authenticatedSeller._id);
                    // break;
                    if (`${items.pID.sellerID}` == `${req.authenticatedSeller._id}`) {
                        // console.log("Success");
                        temp = 1;
                    }
                    // console.log(iterator);
                    if (temp == 1 && items._id == req.params.x) {
                        temp2 = 1;
                        const process_order1 = await order.updateOne({ "products._id": req.params.x }, {
                            $push: {
                                "products.$.processOrder": {
                                    "Status": "Shipped",
                                    "Date": new Date()
                                }
                            }
                        });

                        setTimeout(async () => {
                            const process_order2 = await order.updateOne({ "products._id": req.params.x }, {
                                $push: {
                                    "products.$.processOrder": {
                                        "Status": "Delivered",
                                        "Date": Date.now()
                                    }
                                }
                            });
                        }, 60000);

                        res.sendStatus(200);
                        break;
                    }
                    temp = 0;
                }
                if (temp2 == 1) {
                    break;
                }
            }
            if (temp2 == 0) {
                console.log("JKHDHJDHJSHJ")
                res.status(404).json({ error: "You are not authorized to access this page." });
            }
            // res.render("seller/order/seller_orderDetails",{obj});
            // res.send(obj);
        } else {
            res.status(404).json({ error: "You are not authorized to access this page." });
        }

    } catch (error) {
        res.status(404).json({ error });
    }
});



// ****************************** Review Ratings **************************
app.post("/review_post/:x", auth, async (req, res) => {
    try {
        const a = req.params.x;
        if (req.authenticatedUser) {
            const check_exist = await review.findOne({ $and: [{ UID: req.authenticatedUser._id }, { PID: a }] });
            console.log(check_exist);
            if (check_exist == null) {
                const review_data = new review({
                    UID: req.authenticatedUser._id,
                    PID: a,
                    ratings: req.body.ratings,
                    review: req.body.review
                });
                await review_data.save();
                // res.redirect("/orderDetails/")
                // res.send("Review stored");
                res.redirect(`/products/${a}`);
            }
            else {
                res.send("Review has been already given");
            }
        }
    } catch (error) {
        res.send(error);
    }
});



app.put("/review_update/:x", auth, async (req, res) => {
    try {
        const a = req.params.x;
        if (req.authenticatedUser) {
            const check_exist = await review.findOne({ $and: [{ UID: req.authenticatedUser._id }, { PID: a }] });
            console.log(check_exist);
            if (check_exist !== null) {

                await review.updateOne({ $and: [{ UID: req.authenticatedUser._id }, { PID: a }] }, { ratings: req.body.ratings, review: req.body.review });
                // res.send("Review Updated");
                res.redirect(`/products/${a}`);
            }
            else {
                res.send("Review has been already given");
            }
        }
    } catch (error) {
        res.send(error);
    }
});




// ********************************* Graph *****************************************

app.get("/sales", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin && req.authenticatedAdmin.role == "admin") {
            // Assuming you have orders data stored in a variable named 'orders'
            const orders = await order.find();
            if (!Array.isArray(orders) || orders.length === 0) {
                throw new Error("No orders data available.");
            }

            // Get the last and first dates from the orders data
            const lastDate = new Date(Math.max(...orders.map(order => new Date(order.orderDate))));
            const firstDate = new Date(Math.min(...orders.map(order => new Date(order.orderDate))));

            // Generate an array of dates between lastDate and firstDate
            const datesArray = [];
            const totalAmountArray = [];
            const totalItemsArray = [];
            let currentDate = new Date(lastDate);
            while (currentDate >= firstDate) {
                // Set the time part of currentDate to start of day (00:00:00)
                currentDate.setHours(0, 0, 0, 0);

                // Find orders for the current date
                const ordersInParticularDate = orders.filter(order => {
                    const orderDate = new Date(order.orderDate);
                    // Set the time part of orderDate to start of day (00:00:00)
                    orderDate.setHours(0, 0, 0, 0);
                    // Check if the order falls within the current date
                    return orderDate.getTime() === currentDate.getTime();
                });

                // Calculate total amount and total unique items for the current date
                const totalAmount = ordersInParticularDate.reduce((total, order) => total + order.totalAmount, 0);
                const uniqueProducts = {};
                var totalQuantity = 0;
                ordersInParticularDate.forEach(order => {
                    order.products.forEach(product => {
                        // uniqueProducts[product.quantity] = (uniqueProducts[product.quantity] || 0) + 1;
                        totalQuantity += product.quantity;
                    });
                });
                // const totalItems = Object.keys(uniqueProducts).length;
                const totalItems = totalQuantity;

                // Push the current date, total amount, and total items to the arrays
                datesArray.push(new Date(currentDate));
                totalAmountArray.push(totalAmount);
                totalItemsArray.push(totalItems);

                // Move to the previous day
                currentDate.setDate(currentDate.getDate() - 1);
            }

            // Reverse the arrays to ensure the first date comes before the last date
            const xAxisLabels = datesArray.reverse();
            const yAxisTotalAmount = totalAmountArray.reverse();
            const yAxisTotalItems = totalItemsArray.reverse();

            // Now, xAxisLabels contains the dates ranging from the last date to the first date in your order table
            res.json({ Day: xAxisLabels, totalAmount: yAxisTotalAmount, totalItems: yAxisTotalItems });
        }
        else {
            res.send("Cannot be accessed");
        }
    } catch (error) {
        console.error("Error in /sales endpoint:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});



app.get("/Sellersales", auth_seller, async (req, res) => {
    try {
        // Assuming you have orders data stored in a variable named 'orders'
        const orders = await order.find().populate("products.pID");
        // res.send(orders);
        if (!Array.isArray(orders) || orders.length === 0) {
            throw new Error("No orders data available.");
        }

        // Get the last and first dates from the orders data
        const lastDate = new Date(Math.max(...orders.map(order => new Date(order.orderDate))));
        const firstDate = new Date(Math.min(...orders.map(order => new Date(order.orderDate))));

        // Generate an array of dates between lastDate and firstDate
        const datesArray = [];
        const totalAmountArray = [];
        const totalItemsArray = [];
        let currentDate = new Date(lastDate);
        while (currentDate >= firstDate) {
            // Set the time part of currentDate to start of day (00:00:00)
            currentDate.setHours(0, 0, 0, 0);

            // Find orders for the current date
            const ordersInParticularDate = orders.filter(order => {
                const orderDate = new Date(order.orderDate);
                // Set the time part of orderDate to start of day (00:00:00)
                orderDate.setHours(0, 0, 0, 0);
                // Check if the order falls within the current date
                return orderDate.getTime() === currentDate.getTime();
            });

            // Calculate total amount and total unique items for the current date
            // const totalAmount = ordersInParticularDate.reduce((total, order) => total + order.totalAmount, 0);

            var totalPrice = 0;
            var totalQuantity = 0;
            ordersInParticularDate.forEach(order => {
                order.products.forEach(product => {
                    // uniqueProducts[product.quantity] = (uniqueProducts[product.quantity] || 0) + 1;
                    if (`${product.pID.sellerID}` == `${req.authenticatedSeller._id}`) {
                        totalQuantity += product.quantity;
                        totalPrice += product.Total;
                    }
                });
            });
            // const totalItems = Object.keys(uniqueProducts).length;
            const totalItems = totalQuantity;
            const totalAmount = totalPrice;

            // Push the current date, total amount, and total items to the arrays
            datesArray.push(new Date(currentDate));
            totalAmountArray.push(totalAmount);
            totalItemsArray.push(totalItems);

            // Move to the previous day
            currentDate.setDate(currentDate.getDate() - 1);
        }

        // Reverse the arrays to ensure the first date comes before the last date
        const xAxisLabels = datesArray.reverse();
        const yAxisTotalAmount = totalAmountArray.reverse();
        const yAxisTotalItems = totalItemsArray.reverse();

        // Now, xAxisLabels contains the dates ranging from the last date to the first date in your order table
        res.json({ Day: xAxisLabels, totalAmount: yAxisTotalAmount, totalItems: yAxisTotalItems });
    } catch (error) {
        console.error("Error in /sales endpoint:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});




app.get("/Productsales/:x", auth_seller, async (req, res) => {
    try {
        // Assuming you have orders data stored in a variable named 'orders'
        const orders = await order.find().populate("products.pID");
        // res.send(orders);
        if (!Array.isArray(orders) || orders.length === 0) {
            throw new Error("No orders data available.");
        }

        // Get the last and first dates from the orders data
        const lastDate = new Date(Math.max(...orders.map(order => new Date(order.orderDate))));
        const firstDate = new Date(Math.min(...orders.map(order => new Date(order.orderDate))));

        // Generate an array of dates between lastDate and firstDate
        const datesArray = [];
        const totalAmountArray = [];
        const totalItemsArray = [];
        let currentDate = new Date(lastDate);
        while (currentDate >= firstDate) {
            // Set the time part of currentDate to start of day (00:00:00)
            currentDate.setHours(0, 0, 0, 0);

            // Find orders for the current date
            const ordersInParticularDate = orders.filter(order => {
                const orderDate = new Date(order.orderDate);
                // Set the time part of orderDate to start of day (00:00:00)
                orderDate.setHours(0, 0, 0, 0);
                // Check if the order falls within the current date
                return orderDate.getTime() === currentDate.getTime();
            });

            // Calculate total amount and total unique items for the current date
            // const totalAmount = ordersInParticularDate.reduce((total, order) => total + order.totalAmount, 0);

            var totalPrice = 0;
            var totalQuantity = 0;
            ordersInParticularDate.forEach(order => {
                order.products.forEach(product => {
                    // uniqueProducts[product.quantity] = (uniqueProducts[product.quantity] || 0) + 1;
                    if (`${product.pID.sellerID}` == `${req.authenticatedSeller._id}` && `${req.params.x}` == `${product.pID._id}`) {
                        totalQuantity += product.quantity;
                        totalPrice += product.Total;
                    }
                });
            });
            // const totalItems = Object.keys(uniqueProducts).length;
            const totalItems = totalQuantity;
            const totalAmount = totalPrice;

            // Push the current date, total amount, and total items to the arrays
            datesArray.push(new Date(currentDate));
            totalAmountArray.push(totalAmount);
            totalItemsArray.push(totalItems);

            // Move to the previous day
            currentDate.setDate(currentDate.getDate() - 1);
        }

        // Reverse the arrays to ensure the first date comes before the last date
        const xAxisLabels = datesArray.reverse();
        const yAxisTotalAmount = totalAmountArray.reverse();
        const yAxisTotalItems = totalItemsArray.reverse();

        // Now, xAxisLabels contains the dates ranging from the last date to the first date in your order table
        res.json({ Day: xAxisLabels, totalAmount: yAxisTotalAmount, totalItems: yAxisTotalItems });
    } catch (error) {
        console.error("Error in /sales endpoint:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});


app.get("/AdminProductsales/:x", auth_admin, async (req, res) => {
    try {
        if (req.authenticatedAdmin) {

            // Assuming you have orders data stored in a variable named 'orders'
            const orders = await order.find().populate("products.pID");
            // res.send(orders);
            if (!Array.isArray(orders) || orders.length === 0) {
                throw new Error("No orders data available.");
            }

            // Get the last and first dates from the orders data
            const lastDate = new Date(Math.max(...orders.map(order => new Date(order.orderDate))));
            const firstDate = new Date(Math.min(...orders.map(order => new Date(order.orderDate))));

            // Generate an array of dates between lastDate and firstDate
            const datesArray = [];
            const totalAmountArray = [];
            const totalItemsArray = [];
            let currentDate = new Date(lastDate);
            while (currentDate >= firstDate) {
                // Set the time part of currentDate to start of day (00:00:00)
                currentDate.setHours(0, 0, 0, 0);

                // Find orders for the current date
                const ordersInParticularDate = orders.filter(order => {
                    const orderDate = new Date(order.orderDate);
                    // Set the time part of orderDate to start of day (00:00:00)
                    orderDate.setHours(0, 0, 0, 0);
                    // Check if the order falls within the current date
                    return orderDate.getTime() === currentDate.getTime();
                });

                // Calculate total amount and total unique items for the current date
                // const totalAmount = ordersInParticularDate.reduce((total, order) => total + order.totalAmount, 0);

                var totalPrice = 0;
                var totalQuantity = 0;
                ordersInParticularDate.forEach(order => {
                    order.products.forEach(product => {
                        // uniqueProducts[product.quantity] = (uniqueProducts[product.quantity] || 0) + 1;
                        if (`${req.params.x}` == `${product.pID._id}`) {
                            totalQuantity += product.quantity;
                            totalPrice += product.Total;
                        }
                    });
                });
                // const totalItems = Object.keys(uniqueProducts).length;
                const totalItems = totalQuantity;
                const totalAmount = totalPrice;

                // Push the current date, total amount, and total items to the arrays
                datesArray.push(new Date(currentDate));
                totalAmountArray.push(totalAmount);
                totalItemsArray.push(totalItems);

                // Move to the previous day
                currentDate.setDate(currentDate.getDate() - 1);
            }

            // Reverse the arrays to ensure the first date comes before the last date
            const xAxisLabels = datesArray.reverse();
            const yAxisTotalAmount = totalAmountArray.reverse();
            const yAxisTotalItems = totalItemsArray.reverse();

            // Now, xAxisLabels contains the dates ranging from the last date to the first date in your order table
            res.json({ Day: xAxisLabels, totalAmount: yAxisTotalAmount, totalItems: yAxisTotalItems });
        }
        else {
            res.json({ Error: "Error" });
        }
    } catch (error) {
        console.error("Error in /sales endpoint:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});

app.get("/productRatings/:x", async (req, res) => {
    try {
        const a = req.params.x;
        // console.log(req.params);
        // res.send(req.params);
        const getIndividualProduct = await product.findOne({ _id: a });

        const product_ratings = await review.find({ PID: getIndividualProduct._id })
        // console.log(product_ratings);
        var total_ratings = 0;
        var product_ratings_length = product_ratings.length;
        for (let i = 0; i < product_ratings_length; i++) {
            total_ratings += product_ratings[i].ratings;
        }
        if (product_ratings_length == 0) {
            var average_ratings = 0;
        }
        else {
            var average_ratings = ((total_ratings) / (product_ratings_length));
            average_ratings = Math.floor(average_ratings);
        }
        // console.log(average_ratings);
        res.json({ average_ratings })
    } catch (error) {
        res.send("Error: " + error);
    }
});






// **************************** Forget and Change Password ***********************************************

app.get("/forget_password", async (req, res) => {
    try {
        res.render("password/customer/forget_password");
    } catch (error) {
        res.send(error);
    }
});

app.post("/forget_password", async (req, res) => {
    try {
        // Generate OTP
        const otp = Math.round(1010 + Math.random() * (9900 - 1000))


        // var otp='xyz'
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.sender_email, //Gmail email address
                pass: process.env.sender_email_password //Gmail password or app-specific password
            }
        });

        const info = await transporter.sendMail({
            from: {
                name: "Sayan",
                address: process.env.sender_email
            }, // sender address
            to: [`${req.body.email}`], // list of receivers
            subject: "OTP", // Subject line
            html: `Hello user, your otp for password chaging is <b>${otp}</b>`, // html body
        });


        // Store OTP in session
        req.session.otp = otp;
        req.session.email = req.body.email;

        res.redirect("forget_password_otp");
    } catch (error) {
        res.send(error);
    }
});

app.get("/forget_password_otp", async (req, res) => {
    try {
        // Retrieve OTP from session
        const otp = req.session.otp;
        const email = req.session.email;

        // console.log("OTP IS: ",otp);
        res.render("password/customer/forget_pass_otp");
        // }
    } catch (error) {
        res.send(error);
    }
});

app.post("/forget_password_otp", async (req, res) => {
    try {
        if (req.session.otp == req.body.otp) {
            // res.clearCookie("jwt_signup");
            // res.clearCookie("connect.sid");
            // res.redirect("login");

            res.redirect('new_password');
        }
        else if (!req.body.otp) {
            res.send("Please enter otp");
        }
        else if (req.session.otp != req.body.otp) {
            res.send("Please enter correct otp");
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/new_password", async (req, res) => {
    try {
        res.render('password/customer/new_password');
    } catch (error) {
        res.send(error);
    }
});

app.post("/new_password", async (req, res) => {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        await User.updateOne({ email: req.session.email }, { password: hashedPassword });
        res.clearCookie("connect.sid");
        res.redirect("login");
    } catch (error) {
        res.send(error);
    }
});






app.get("/seller_forget_password", async (req, res) => {
    try {
        res.render("password/seller/forget_password");
    } catch (error) {
        res.send(error);
    }
});

app.post("/seller_forget_password", async (req, res) => {
    try {
        // Generate OTP
        const otp = Math.round(1010 + Math.random() * (9900 - 1000))


        // var otp='xyz'
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.sender_email, //Gmail email address
                pass: process.env.sender_email_password //Gmail password or app-specific password
            }
        });

        const info = await transporter.sendMail({
            from: {
                name: "Sayan",
                address: process.env.sender_email
            }, // sender address
            to: [`${req.body.email}`], // list of receivers
            subject: "OTP", // Subject line
            html: `Hello seller, your otp for password chaging is <b>${otp}</b>`, // html body
        });


        // Store OTP in session
        req.session.otp = otp;
        req.session.email = req.body.email;

        res.redirect("seller_forget_password_otp");
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller_forget_password_otp", async (req, res) => {
    try {
        // Retrieve OTP from session
        const otp = req.session.otp;
        const email = req.session.email;

        // console.log("OTP IS: ",otp);
        res.render("password/seller/forget_pass_otp");
        // }
    } catch (error) {
        res.send(error);
    }
});

app.post("/seller_forget_password_otp", async (req, res) => {
    try {
        if (req.session.otp == req.body.otp) {
            // res.clearCookie("jwt_signup");
            // res.clearCookie("connect.sid");
            // res.redirect("login");

            res.redirect('seller_new_password');
        }
        else if (!req.body.otp) {
            res.send("Please enter otp");
        }
        else if (req.session.otp != req.body.otp) {
            res.send("Please enter correct otp");
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/seller_new_password", async (req, res) => {
    try {
        res.render('password/seller/new_password');
    } catch (error) {
        res.send(error);
    }
});

app.post("/seller_new_password", async (req, res) => {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        await Seller.updateOne({ email: req.session.email }, { password: hashedPassword });
        res.clearCookie("connect.sid");
        res.redirect("sellerLogin");
    } catch (error) {
        res.send(error);
    }
});






app.get("/admin_forget_password", async (req, res) => {
    try {
        res.render("password/admin/forget_password");
    } catch (error) {
        res.send(error);
    }
});

app.post("/admin_forget_password", async (req, res) => {
    try {
        // Generate OTP
        const otp = Math.round(1010 + Math.random() * (9900 - 1000))


        // var otp='xyz'
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.sender_email, // Gmail email address
                pass: process.env.sender_email_password // Gmail password or app-specific password
            }
        });

        const info = await transporter.sendMail({
            from: {
                name: "Sayan",
                address: process.env.sender_email
            }, // sender address
            to: [`${req.body.email}`], // list of receivers
            subject: "OTP", // Subject line
            html: `Hello admin, your otp for password chaging is <b>${otp}</b>`, // html body
        });


        // Store OTP in session
        req.session.otp = otp;
        req.session.email = req.body.email;

        res.redirect("admin_forget_password_otp");
    } catch (error) {
        res.send(error);
    }
});

app.get("/admin_forget_password_otp", async (req, res) => {
    try {
        // Retrieve OTP from session
        const otp = req.session.otp;
        const email = req.session.email;

        // console.log("OTP IS: ",otp);
        res.render("password/admin/forget_pass_otp");
        // }
    } catch (error) {
        res.send(error);
    }
});

app.post("/admin_forget_password_otp", async (req, res) => {
    try {
        if (req.session.otp == req.body.otp) {
            // res.clearCookie("jwt_signup");
            // res.clearCookie("connect.sid");
            // res.redirect("login");

            res.redirect('admin_new_password');
        }
        else if (!req.body.otp) {
            res.send("Please enter otp");
        }
        else if (req.session.otp != req.body.otp) {
            res.send("Please enter correct otp");
        }
    } catch (error) {
        res.send(error);
    }
});

app.get("/admin_new_password", async (req, res) => {
    try {
        res.render('password/admin/new_password');
    } catch (error) {
        res.send(error);
    }
});

app.post("/admin_new_password", async (req, res) => {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        await Admin.updateOne({ email: req.session.email }, { password: hashedPassword });
        res.clearCookie("connect.sid");
        res.redirect("adminLogin");
    } catch (error) {
        res.send(error);
    }
});




app.get("/seller/Threshold_crossed", auth_seller, async (req, res) => {
    try {
        if (req.authenticatedSeller && req.authenticatedSeller.status == "complete") {
            const items = await product.find({ $and: [{ sellerID: req.authenticatedSeller._id }, { status: "Approved" }, { $expr: { $gte: ["$threshold", "$stock"] } }] });

            console.log("items");

            const pending_products = await product.find({ $and: [{ status: "Pending" }, { sellerID: req.authenticatedSeller._id }] });
            const rejected_products = await product.find({ $and: [{ status: "Rejected" }, { sellerID: req.authenticatedSeller._id }] });
            const approved_products = await product.find({ $and: [{ status: "Approved" }, { sellerID: req.authenticatedSeller._id }] });

            const pending_products_length = pending_products.length;
            const rejected_products_length = rejected_products.length;
            const approved_products_length = approved_products.length;

            res.render("seller_product/seller_product_list", { items, pending_products_length, rejected_products_length, approved_products_length });
        }
        else {
            res.send("Page not found")
        }
    } catch (error) {
        res.send(error);
    }
})




// app.get("/process_order",)


// app.get("/kkkkkk", async(req,res)=>{
//     try {
//         // if(req.authenticatedSeller){
//         //     await product.updateMany({status:"Deleted"},{status:"Approved"});
//         //     res.send("Success");
//         // }
//         // // const user=await Seller.findOne({name:"sayan"})
//         // await Seller.updateOne({name:"joy"},{active:true, status:"incomplete"});
//         const x= await product.find({status:"Inactive"});
//         res.send(x)
//     } catch (error) {
//         res.send(error);
//     }
// });



app.get("*", (req, res) => {
    res.send("This page does not exist.")
})

app.listen(8000, () => {
    console.log("Connected...")
});