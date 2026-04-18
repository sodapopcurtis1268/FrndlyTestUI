# Claude-test-automation

Selenium + TestNG + Maven test automation framework using Page Object Model.

## Stack
- Java 17
- Selenium 4
- TestNG 7
- WebDriverManager (auto browser driver management)
- Maven

## Project Structure
```
src/
  main/java/com/automation/
    config/      - ConfigReader (config.properties)
    pages/       - Page Object classes (extend BasePage)
    utils/       - DriverFactory, WaitUtils
  test/java/com/automation/
    base/        - BaseTest (setUp/tearDown)
    tests/       - Test classes (extend BaseTest)
  main/resources/
    config.properties  - browser, URL, timeouts
  test/resources/
    testng.xml         - test suite definition
```

## How to Add a New Page
1. Create a class in `src/main/java/com/automation/pages/` extending `BasePage`
2. Use `@FindBy` annotations for locators
3. Use `click()`, `type()`, `getText()` helpers from `BasePage`

## How to Add a New Test
1. Create a class in `src/test/java/com/automation/tests/` extending `BaseTest`
2. Add `@Test` methods
3. Register the class in `testng.xml`

## Running Tests
```bash
mvn test                         # Run full suite
mvn test -Dbrowser=firefox       # Override browser
mvn test -Dheadless=true         # Run headless
```

## Config
Edit `src/main/resources/config.properties` to set:
- `base.url` - application URL
- `browser` - chrome | firefox | edge
- `headless` - true | false
