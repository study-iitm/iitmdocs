#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "weaviate-client>=4.4.0",
#     "openai>=1.0.0",
#     "python-dotenv>=1.0.0",
# ]
# ///
"""
Test runner for Weaviate document search quality
"""

import os
import json
import time
from typing import Dict, List, Any
from dotenv import load_dotenv
from weaviate_provider import WeaviateProvider

class TestRunner:
    def __init__(self):
        load_dotenv()
        
        self.config = {
            'apiHost': os.getenv('WEAVIATE_URL'),
            'apiKey': os.getenv('WEAVIATE_API_KEY'), 
            'openaiApiKey': os.getenv('OPENAI_API_KEY'),
            'collection': 'Document',
            'nearTextLimit': 5
        }
        
        self.provider = WeaviateProvider(self.config)
        self.test_cases = self._define_test_cases()
        
    def _define_test_cases(self) -> List[Dict[str, Any]]:
        """Define test cases for document search"""
        return [
            {
                'name': 'Basic Admission Query',
                'query': 'admission requirements',
                'expected_keywords': ['admission', 'programme', 'eligibility'],
                'expected_files': ['Admission to the programme.md']
            },
            {
                'name': 'Course Registration Query', 
                'query': 'course registration process',
                'expected_keywords': ['registration', 'course', 'steps'],
                'expected_files': ['Course registration - steps involved.md']
            },
            {
                'name': 'Learning Paths Query',
                'query': 'learning paths available',
                'expected_keywords': ['learning paths', 'Foundation', 'Diploma'],
                'expected_files': ['Learning paths available.md']
            },
            {
                'name': 'System Requirements Query',
                'query': 'software hardware requirements',
                'expected_keywords': ['software', 'hardware', 'RAM', 'requirements'],
                'expected_files': ['Software and Hardware Requirements.md']
            },
            {
                'name': 'Credit Clearing Query',
                'query': 'credit clearing capability',
                'expected_keywords': ['Credit Clearing', 'CCC', 'capability'],
                'expected_files': ['Credit Clearing Capability.md']
            },
            {
                'name': 'Academic Certificates Query',
                'query': 'academic certificates and prizes',
                'expected_keywords': ['Certificate', 'Academic', 'prizes'],
                'expected_files': ['Eligibility Criteria Prize.md']
            },
            {
                'name': 'Program Flexibility Query',
                'query': 'program flexibility options',
                'expected_keywords': ['Flexibility', 'program'],
                'expected_files': ['Flexibility.md']
            },
            {
                'name': 'Re-entry Information Query',
                'query': 're-enter after diploma',
                'expected_keywords': ['Re Entry', 'Diploma'],
                'expected_files': ['Re Entry after Diploma.md']
            },
            {
                'name': 'Fees Information Query',
                'query': 'program fees cost',
                'expected_keywords': ['fees', 'programme'],
                'expected_files': ['Fees for the entire programme.md']
            },
            {
                'name': 'Complex Multi-concept Query',
                'query': 'foundation courses prerequisites mathematics statistics',
                'expected_keywords': ['Foundation', 'prerequisite', 'Maths', 'Statistics'],
                'expected_files': ['Learning paths available.md']
            }
        ]
    
    def run_test(self, test_case: Dict[str, Any]) -> Dict[str, Any]:
        """Run a single test case"""
        print(f"🧪 Running test: {test_case['name']}")
        
        start_time = time.time()
        result = self.provider.call_api("", {'query': test_case['query']})
        end_time = time.time()
        
        # Analyze results
        output = result.get('output', '')
        metadata = result.get('metadata', {})
        
        # Check keyword presence
        keywords_found = []
        keywords_missing = []
        
        for keyword in test_case['expected_keywords']:
            if keyword.lower() in output.lower():
                keywords_found.append(keyword)
            else:
                keywords_missing.append(keyword)
        
        # Check file relevance
        returned_files = metadata.get('filenames', [])
        expected_files_found = []
        
        for expected_file in test_case.get('expected_files', []):
            if any(expected_file in returned_file for returned_file in returned_files):
                expected_files_found.append(expected_file)
        
        # Calculate scores
        keyword_score = len(keywords_found) / len(test_case['expected_keywords']) if test_case['expected_keywords'] else 1.0
        file_relevance_score = len(expected_files_found) / len(test_case.get('expected_files', [])) if test_case.get('expected_files') else 1.0
        
        response_time = end_time - start_time
        
        test_result = {
            'name': test_case['name'],
            'query': test_case['query'],
            'passed': keyword_score >= 0.5 and file_relevance_score >= 0.5,
            'keyword_score': keyword_score,
            'file_relevance_score': file_relevance_score,
            'response_time_ms': round(response_time * 1000, 2),
            'results_count': metadata.get('results_count', 0),
            'top_score': metadata.get('top_score', 0.0),
            'keywords_found': keywords_found,
            'keywords_missing': keywords_missing,
            'expected_files_found': expected_files_found,
            'returned_files': returned_files[:3]  # Top 3 files
        }
        
        status = "✅ PASS" if test_result['passed'] else "❌ FAIL"
        print(f"   {status} - Keyword: {keyword_score:.1%}, Relevance: {file_relevance_score:.1%}, Time: {response_time*1000:.0f}ms")
        
        return test_result
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all test cases and generate report"""
        print("🚀 Starting Weaviate Document Search Quality Tests\n")
        
        results = []
        start_time = time.time()
        
        for test_case in self.test_cases:
            try:
                result = self.run_test(test_case)
                results.append(result)
            except Exception as e:
                print(f"❌ Test failed with error: {e}")
                results.append({
                    'name': test_case['name'],
                    'query': test_case['query'],
                    'passed': False,
                    'error': str(e)
                })
            print()  # Add spacing between tests
        
        total_time = time.time() - start_time
        
        # Generate summary
        passed_tests = [r for r in results if r.get('passed', False)]
        total_tests = len(results)
        pass_rate = len(passed_tests) / total_tests if total_tests > 0 else 0
        
        avg_keyword_score = sum(r.get('keyword_score', 0) for r in results) / total_tests if total_tests > 0 else 0
        avg_file_relevance = sum(r.get('file_relevance_score', 0) for r in results) / total_tests if total_tests > 0 else 0
        avg_response_time = sum(r.get('response_time_ms', 0) for r in results) / total_tests if total_tests > 0 else 0
        
        summary = {
            'total_tests': total_tests,
            'passed_tests': len(passed_tests),
            'failed_tests': total_tests - len(passed_tests),
            'pass_rate': pass_rate,
            'avg_keyword_score': avg_keyword_score,
            'avg_file_relevance_score': avg_file_relevance,
            'avg_response_time_ms': avg_response_time,
            'total_execution_time_s': round(total_time, 2),
            'test_results': results
        }
        
        return summary
    
    def print_summary(self, summary: Dict[str, Any]):
        """Print test summary"""
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {summary['total_tests']}")
        print(f"Passed: {summary['passed_tests']} ✅")
        print(f"Failed: {summary['failed_tests']} ❌")
        print(f"Pass Rate: {summary['pass_rate']:.1%}")
        print(f"Avg Keyword Score: {summary['avg_keyword_score']:.1%}")
        print(f"Avg File Relevance: {summary['avg_file_relevance_score']:.1%}")
        print(f"Avg Response Time: {summary['avg_response_time_ms']:.0f}ms")
        print(f"Total Execution Time: {summary['total_execution_time_s']:.1f}s")
        
        print("\n📋 DETAILED RESULTS:")
        for result in summary['test_results']:
            status = "✅" if result.get('passed') else "❌"
            print(f"{status} {result['name']}")
            if not result.get('passed') and result.get('keywords_missing'):
                print(f"    Missing keywords: {', '.join(result['keywords_missing'])}")
    
    def save_results(self, summary: Dict[str, Any], filename: str = "test_results.json"):
        """Save test results to file"""
        with open(filename, 'w') as f:
            json.dump(summary, f, indent=2)
        print(f"\n💾 Results saved to {filename}")
    
    def close(self):
        """Clean up resources"""
        self.provider.close()

def main():
    """Main test execution"""
    runner = TestRunner()
    
    try:
        summary = runner.run_all_tests()
        runner.print_summary(summary)
        runner.save_results(summary)
        
        # Exit with appropriate code
        exit_code = 0 if summary['pass_rate'] >= 0.8 else 1
        return exit_code
        
    except Exception as e:
        print(f"❌ Test execution failed: {e}")
        return 1
    finally:
        runner.close()

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)