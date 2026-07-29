import { connectDB, UserModel, PlanModel } from "./db";
import bcryptjs from "bcryptjs";

// Default plans seeded so that user subscription.plan names resolve correctly.
const DEFAULT_PLANS = [
  {
    name: "Free",
    price: 0,
    duration: "monthly",
    credits: 100,
    callingRate: 2.0,
    smsRate: 0.5,
    whatsappRate: 0.5,
    extraCreditPrice: 0,
    maxCreditPurchase: 0,
    features: [],               // No gated features — overview only
    limitations: ["100 credits/month", "Basic overview only", "No AI calling"],
    description: "Get started for free with basic access.",
    isActive: true,
    selfBranding: false,
    overviewLevel: "basic",
  },
  {
    name: "Starter",
    price: 999,
    duration: "monthly",
    credits: 500,
    callingRate: 1.5,
    smsRate: 0.3,
    whatsappRate: 0.4,
    extraCreditPrice: 2,
    maxCreditPurchase: 500,
    features: ["crm", "call_history"],
    limitations: ["500 credits/month", "CRM & Call History only", "No bulk messaging"],
    description: "For individuals who need lead tracking and call history.",
    isActive: true,
    selfBranding: false,
    overviewLevel: "basic",
  },
  {
    name: "Pro",
    price: 2999,
    duration: "monthly",
    credits: 2000,
    callingRate: 1.0,
    smsRate: 0.25,
    whatsappRate: 0.3,
    extraCreditPrice: 1.5,
    maxCreditPurchase: 2000,
    features: ["crm", "campaigns", "calendar", "call_history", "analytics"],
    limitations: ["2000 credits/month", "No bulk WhatsApp/SMS"],
    description: "Everything you need to run AI calling campaigns with full CRM.",
    isActive: true,
    selfBranding: false,
    overviewLevel: "intermediate",
  },
  {
    name: "Business",
    price: 5999,
    duration: "monthly",
    credits: 5000,
    callingRate: 0.75,
    smsRate: 0.2,
    whatsappRate: 0.25,
    extraCreditPrice: 1.2,
    maxCreditPurchase: 5000,
    features: ["crm", "campaigns", "calendar", "call_history", "analytics", "bulk_sms", "whatsapp"],
    limitations: ["5000 credits/month"],
    description: "All features including Bulk SMS and WhatsApp messaging.",
    isActive: true,
    selfBranding: false,
    overviewLevel: "advanced",
  },
  {
    name: "Enterprise",
    price: 14999,
    duration: "monthly",
    credits: 10000,
    callingRate: 0.5,
    smsRate: 0.15,
    whatsappRate: 0.2,
    extraCreditPrice: 1.0,
    maxCreditPurchase: 0,     // unlimited top-up
    features: ["crm", "campaigns", "calendar", "call_history", "analytics", "bulk_sms", "whatsapp"],
    limitations: [],
    description: "Unlimited scale with white-labelling, full analytics and priority support.",
    isActive: true,
    selfBranding: true,
    overviewLevel: "complete",
  },
];

async function seed() {
  try {
    await connectDB();
    console.log("Connected to MongoDB");

    // ── Seed Plans ──────────────────────────────────────────────────────────
    console.log("\nSeeding plans…");
    for (const planData of DEFAULT_PLANS) {
      const existing = await PlanModel.findOne({ name: planData.name });
      if (!existing) {
        await PlanModel.create(planData);
        console.log(`  ✓ Plan created: ${planData.name}`);
      } else {
        // Update features/overviewLevel so they stay in sync with code changes
        await PlanModel.updateOne(
          { name: planData.name },
          {
            $set: {
              features: planData.features,
              overviewLevel: planData.overviewLevel,
              credits: planData.credits,
              callingRate: planData.callingRate,
              smsRate: planData.smsRate,
              whatsappRate: planData.whatsappRate,
              isActive: planData.isActive,
              selfBranding: planData.selfBranding,
            },
          }
        );
        console.log(`  ↺ Plan updated: ${planData.name}`);
      }
    }

    // ── Seed Admin User ─────────────────────────────────────────────────────
    console.log("\nSeeding users…");
    const adminExists = await UserModel.findOne({ email: "admin@nijvox.com" });

    if (!adminExists) {
      const hashedPassword = await bcryptjs.hash("Admin@123#", 10);
      await UserModel.create({
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
      console.log("  ✓ Admin user created: admin@nijvox.com / Admin@123#");
    } else {
      const hashedPassword = await bcryptjs.hash("Admin@123#", 10);
      await UserModel.updateOne(
        { email: "admin@nijvox.com" },
        { $set: { password: hashedPassword } }
      );
      console.log("  ↺ Admin password reset: admin@nijvox.com / Admin@123#");
    }

    // ── Seed Test User ──────────────────────────────────────────────────────
    const testUserExists = await UserModel.findOne({ email: "test@example.com" });

    if (!testUserExists) {
      const hashedPassword = await bcryptjs.hash("test123", 10);
      await UserModel.create({
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
      console.log("  ✓ Test user created: test@example.com / test123  (Pro plan)");
    } else {
      console.log("  ↺ Test user already exists: test@example.com / test123  (Pro plan)");
    }

    console.log("\n✅ Database seeded successfully!");
    console.log("\nDefault accounts:");
    console.log("  Admin  → admin@nijvox.com  / Admin@123#  (role: admin, bypasses all feature gates)");
    console.log("  Test   → test@example.com  / test123     (role: user, Pro plan features)");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seed();
