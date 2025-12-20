import { connectDB, UserModel } from "./db";
import bcryptjs from "bcryptjs";

async function seed() {
  try {
    await connectDB();
    console.log("Connected to MongoDB");

    const adminExists = await UserModel.findOne({ email: "admin@nijvox.com" });
    
    if (!adminExists) {
      const hashedPassword = await bcryptjs.hash("admin123", 10);
      const admin = await UserModel.create({
        email: "admin@nijvox.com",
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        subscription: {
          plan: "Enterprise",
          status: "Active",
          monthlyCallCredits: 10000,
          creditsUsed: 0,
          joinedDate: new Date(),
        },
        settings: {
          dailyCallLimit: 1000,
          dndEnabled: false,
          localPresenceDialing: true,
        },
      });
      console.log("✓ Admin user created: admin@nijvox.com / admin123");
    } else {
      console.log("✓ Admin user already exists");
    }

    const testUserExists = await UserModel.findOne({ email: "test@example.com" });
    
    if (!testUserExists) {
      const hashedPassword = await bcryptjs.hash("test123", 10);
      const testUser = await UserModel.create({
        email: "test@example.com",
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        role: "user",
        companyName: "Test Company",
        phone: "+1234567890",
        subscription: {
          plan: "Pro",
          status: "Active",
          monthlyCallCredits: 2000,
          creditsUsed: 250,
          joinedDate: new Date(),
        },
        settings: {
          dailyCallLimit: 500,
          dndEnabled: false,
          localPresenceDialing: true,
        },
      });
      console.log("✓ Test user created: test@example.com / test123");
    } else {
      console.log("✓ Test user already exists");
    }

    console.log("\nDatabase seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seed();
