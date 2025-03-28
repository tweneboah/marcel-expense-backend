import mongoose from "mongoose";

const ExpenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    startingPoint: {
      type: String,
      required: [true, "Please add a starting point"],
      trim: true,
    },
    destinationPoint: {
      type: String,
      required: [true, "Please add a destination point"],
      trim: true,
    },
    startingPointPlaceId: {
      type: String,
      trim: true,
    },
    destinationPointPlaceId: {
      type: String,
      trim: true,
    },
    formattedStartingAddress: {
      type: String,
      trim: true,
    },
    formattedDestinationAddress: {
      type: String,
      trim: true,
    },
    waypoints: [
      {
        placeId: String,
        description: String,
        formattedAddress: String,
      },
    ],
    distance: {
      type: Number,
      required: [true, "Please add the distance in kilometers"],
    },
    duration: {
      type: String,
      trim: true,
    },
    durationInSeconds: {
      type: Number,
    },
    isCalculatedDistance: {
      type: Boolean,
      default: false,
    },
    routeSnapshot: {
      type: Object,
    },
    costPerKm: {
      type: Number,
      required: [true, "Please add the cost per kilometer"],
    },
    totalCost: {
      type: Number,
      required: [true, "Please add the total cost"],
    },
    journeyDate: {
      type: Date,
      required: [true, "Please add the journey date"],
      default: Date.now,
    },
    notes: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create a virtual property to calculate total cost
ExpenseSchema.pre("save", function (next) {
  this.totalCost = this.distance * this.costPerKm;
  next();
});

const Expense = mongoose.model("Expense", ExpenseSchema);

export default Expense;
