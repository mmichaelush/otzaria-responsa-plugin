import 'package:test/test.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';

/// הבקר נוצר לפני שהמשתמש מדליק את ההפעלה האוטומטית: ערך שנלכד בבנייה נשאר
/// `false` עד להפעלה מחדש של אוצריא, והפתיחה נכשלת בזמן שההגדרה דלוקה.
void main() {
  test('ההרשאה נקראת בכל פנייה, לא נלכדת בבנייה', () {
    var enabled = false;
    final controller = ResponsaController(allowAutoStart: () => enabled);

    expect(controller.autoStart, isFalse);

    enabled = true;

    expect(controller.autoStart, isTrue);
  });

  test('ברירת המחדל מתירה הפעלה', () {
    expect(ResponsaController().autoStart, isTrue);
  });

  // הפעלה איטית מקצרת את מה שנשאר לפעולה, כדי שהבקשה כולה תסתיים לפני
  // 120 השניות שאחריהן אוצריא מוותרת.
  test('the operation gets what the launch left of the request budget', () {
    expect(
      ResponsaController.budgetAfter(
        Duration.zero,
        ResponsaController.searchBudget,
      ),
      ResponsaController.searchBudget,
    );
    expect(
      ResponsaController.budgetAfter(
        const Duration(seconds: 70),
        ResponsaController.searchBudget,
      ),
      ResponsaController.requestBudget - const Duration(seconds: 70),
    );
    expect(
      ResponsaController.launchTimeout + const Duration(seconds: 5),
      lessThan(ResponsaController.requestBudget),
    );
  });
}
