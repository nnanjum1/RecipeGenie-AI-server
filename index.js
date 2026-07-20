


const express = require('express');
const cors = require('cors');
const axios = require("axios");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require("openai");

const ai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});


const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "https://your-project.vercel.app",
        ],
        credentials: true,
    })
);


app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB!");

        const db = client.db("recipe_genie");
        const recipeCollection = db.collection("recipes");

        const chatCollection = db.collection("chat");
        const reviewCollection = db.collection("reviews");


        app.post("/recipes", async (req, res) => {
            try {
                const recipe = {
                    ...req.body,
                    createdAt: new Date(),
                };

                const result = await recipeCollection.insertOne(recipe);

                res.send(result);
            } catch (error) {
                res.status(500).send({
                    message: "Failed to add recipe",
                });
            }
        });

        app.get("/recipes", async (req, res) => {

            try {

                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 8;

                const skip = (page - 1) * limit;


                const recipes = await recipeCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();


                const totalRecipes = await recipeCollection.countDocuments();


                res.send({
                    recipes,
                    totalPages: Math.ceil(totalRecipes / limit),
                    currentPage: page
                });


            } catch (error) {

                res.status(500).send({
                    message: "Failed to fetch recipes"
                });

            }

        });


        app.get("/recipes/:id", async (req, res) => {

            try {

                const id = req.params.id;

                console.log("Requested ID:", id);

                const result = await recipeCollection.findOne({
                    _id: new ObjectId(id)
                });

                console.log("Found Recipe:", result);


                if (!result) {
                    return res.status(404).send({
                        message: "Recipe not found"
                    });
                }

                res.send(result);


            } catch (error) {

                console.log(error);

                res.status(500).send({
                    message: "Failed to get recipe"
                });

            }

        });

        app.get("/my-recipes/:email", async (req, res) => {

            try {

                const email = decodeURIComponent(req.params.email);


                const result = await recipeCollection
                    .find({
                        userEmail: email
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();


                res.send(result);


            } catch (error) {

                console.log(error); // add this

                res.status(500).send({
                    message: "Failed to fetch user recipes",
                    error: error.message
                });

            }

        });

        app.delete("/recipes/:id", async (req, res) => {
            try {

                const id = req.params.id;

                const result = await recipeCollection.deleteOne({
                    _id: new ObjectId(id)
                });

                res.send(result);

            } catch (error) {

                res.status(500).send({
                    message: "Failed to delete recipe"
                });

            }
        });

        app.patch("/recipes/:id", async (req, res) => {
            try {

                const id = req.params.id;

                const updatedRecipe = req.body;

                const result = await recipeCollection.updateOne(
                    {
                        _id: new ObjectId(id)
                    },
                    {
                        $set: updatedRecipe
                    }
                );

                res.send(result);

            } catch (error) {

                res.status(500).send({
                    message: "Failed to update recipe"
                });

            }
        });


        app.patch("/recipes/like/:id", async (req, res) => {

            try {

                const id = req.params.id;
                const { change } = req.body;


                const result = await recipeCollection.updateOne(

                    {
                        _id: new ObjectId(id)
                    },

                    {
                        $inc: {
                            likes: change
                        }
                    }

                );


                res.send(result);


            } catch (error) {

                res.status(500).send({
                    message: "Like update failed"
                });

            }

        });





        app.post("/generate-recipe", async (req, res) => {

            try {

                const {
                    ingredients,
                    cuisine,
                    difficulty,
                    cookingTime,
                    servings,
                } = req.body;

                const prompt = `
Generate ONE cooking recipe.

Return ONLY valid JSON.
Do not use markdown.
Do not wrap with \`\`\`.

Format:

{
  "title":"",
  "shortDescription":"",
  "description":"",
  "category":"",
  "cuisine":"",
  "difficulty":"",
  "cookingTime":0,
  "servings":0,
  "ingredients":[],
  "instructions":[],
  "imageQuery":""
}

Requirements:

- Ingredients: ${ingredients}
- Cuisine: ${cuisine}
- Difficulty: ${difficulty}
- Cooking Time: ${cookingTime} minutes
- Servings: ${servings}

Generate a realistic recipe.

imageQuery should contain only the food name.
`;

                const response = await ai.chat.completions.create({
                    model: "llama-3.3-70b-versatile",

                    response_format: {
                        type: "json_object"
                    },

                    messages: [
                        {
                            role: "system",
                            content: "Return only valid JSON. No markdown. No explanations."
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                });

                const text = response.choices[0].message.content;

                console.log("========== RAW AI RESPONSE ==========");
                console.log(text);
                console.log("=====================================");

                const recipe = JSON.parse(text);

                res.send(recipe);



            }
            catch (error) {

                console.log(error);

                res.status(500).send({
                    message: "Failed to generate recipe",
                    error: error.message,
                });

            }

        });

        app.get("/generate-recipe", (req, res) => {
            res.send("Generate Recipe API is working. Use POST.");
        });

        app.post("/recipe-image", async (req, res) => {
            try {

                const { query } = req.body;

                const url =
                    `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}` +
                    `&q=${encodeURIComponent(query + " food")}` +
                    `&image_type=photo&category=food&per_page=5`;


                const controller = new AbortController();

                const timeout = setTimeout(() => {
                    controller.abort();
                }, 10000);


                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        "User-Agent": "RecipeGenie-App"
                    }
                });


                clearTimeout(timeout);


                if (!response.ok) {
                    throw new Error(
                        `Pixabay failed ${response.status}`
                    );
                }


                const data = await response.json();


                const image =
                    data.hits?.[0]?.webformatURL ||
                    "https://images.unsplash.com/photo-1504674900247-0877df9cc836";


                res.send({
                    image
                });


            }
            catch (error) {

                console.log("PIXABAY ERROR:", error.message);


                res.send({
                    image:
                        "https://images.unsplash.com/photo-1504674900247-0877df9cc836"
                });

            }
        });


        app.get("/chat-history/:email", async (req, res) => {

            try {


                const email = decodeURIComponent(
                    req.params.email
                );


                const chat =
                    await chatCollection.findOne({
                        userEmail: email
                    });



                res.send(
                    chat || {
                        messages: []
                    }
                );


            }
            catch (error) {

                console.log(error);

                res.status(500).send({

                    message: "Failed to load chat history"

                });

            }


        });



        app.post("/chat", async (req, res) => {

            try {


                const {
                    userEmail,
                    message
                } = req.body;



                if (!userEmail || !message) {

                    return res.status(400).send({
                        message: "Email and message required"
                    });

                }



                const oldChat =
                    await chatCollection.findOne({
                        userEmail
                    });



                let history = [];


                if (oldChat) {

                    history = oldChat.messages.slice(-30);
                }





                const messages = [
                    {
                        role: "system",
                        content:
                            "You are Recipe Genie AI Assistant. Help users with recipes, cooking tips, ingredient replacements and food questions.",
                    },
                ];

                history.forEach((item) => {
                    messages.push({
                        role: item.role,
                        content: item.content,
                    });
                });

                messages.push({
                    role: "user",
                    content: message,
                });




                const response = await ai.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages,
                });

                const answer = response.choices[0].message.content;









                await chatCollection.updateOne(

                    {
                        userEmail
                    },


                    {

                        $push: {

                            messages: {

                                $each: [

                                    {
                                        role: "user",
                                        content: message,
                                        createdAt: new Date()
                                    },


                                    {
                                        role: "assistant",
                                        content: answer,
                                        createdAt: new Date()
                                    }


                                ]

                            }

                        },


                        $set: {

                            updatedAt: new Date()

                        }


                    },


                    {
                        upsert: true
                    }


                );




                res.send({

                    answer

                });



            }
            catch (error) {

                console.log(error);


                res.status(500).send({

                    message: "AI chat failed",

                    error: error.message

                });


            }


        });



        app.delete("/chat-history/:email", async (req, res) => {


            try {


                const email = req.params.email;



                await chatCollection.deleteOne({

                    userEmail: email

                });



                res.send({

                    message: "Chat cleared"

                });



            }

            catch (error) {


                res.status(500).send({

                    message: "Delete failed"

                });


            }


        });


        app.post("/reviews", async (req, res) => {

            try {

                const review = {
                    ...req.body,
                    createdAt: new Date()
                };

                const result = await reviewCollection.insertOne(review);

                res.send(result);

            } catch (error) {

                res.status(500).send({
                    message: "Failed to submit review"
                });

            }

        });



        app.get("/reviews", async (req, res) => {

            try {

                const reviews = await reviewCollection
                    .find()
                    .sort({
                        createdAt: -1
                    })
                    .limit(6)
                    .toArray();


                res.send(reviews);


            } catch (error) {

                res.status(500).send({
                    message: "Failed to load reviews"
                });

            }

        });


    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("Server is running fine!");
});

app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});