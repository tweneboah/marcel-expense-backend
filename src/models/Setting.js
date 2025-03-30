import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Please add a setting key"],
      trim: true,
      unique: true,
      maxlength: [50, "Key cannot be more than 50 characters"],
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Please add a setting value"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot be more than 500 characters"],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Setting = mongoose.model("Setting", SettingSchema);

export default Setting;
